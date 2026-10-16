import {cp, mkdtemp, mkdir, readFile, writeFile, rm, realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';

const experiment = dirname(fileURLToPath(import.meta.url));
const project = join(experiment, '../..');
const require = createRequire(import.meta.url);
const upstream = await realpath(join(project, 'node_modules/maplibre-gl'));
const version = JSON.parse(await readFile(join(upstream, 'package.json'), 'utf8')).version;
if (version !== '3.6.2') throw new Error(`此源码补丁基于 MapLibre 3.6.2，当前依赖为 ${version}；需要先重新核对补丁。`);
const esbuildPath = process.env.ESBUILD_PACKAGE
    ? join(process.env.ESBUILD_PACKAGE, 'lib/main.js')
    : require.resolve('esbuild');
const {build} = await import(pathToFileURL(esbuildPath).href);
const temporary = await mkdtemp(join(tmpdir(), 'tokyorailmap-native-offset-'));
const native = join(temporary, 'maplibre-gl');
const output = process.argv.includes('--vendor') ? join(project, 'vendor/maplibre-gl') : join(experiment, 'dist');
try {
    await mkdir(native, {recursive: true});
    await cp(join(upstream, 'src'), join(native, 'src'), {recursive: true});
    await cp(join(upstream, 'package.json'), join(native, 'package.json'));
    for (const name of ['maplibre-3.6.2.patch', 'maplibre-symbol-placement.patch']) {
        const patch = join(experiment, name);
        execFileSync('git', ['apply', '--check', patch], {cwd: native, stdio: 'inherit'});
        execFileSync('git', ['apply', patch], {cwd: native, stdio: 'inherit'});
    }
    const shared = {
        bundle: true,
        tsconfigRaw: {compilerOptions: {useDefineForClassFields: false}},
        platform: 'browser', format: 'iife', target: ['es2020'], minify: true, write: false,
        nodePaths: [join(project, 'node_modules')],
        define: {'process.env.NODE_ENV': '"production"'}, logLevel: 'warning'
    };
    const worker = await build({...shared, entryPoints: [join(native, 'src/source/worker.ts')]});
    const main = await build({...shared, entryPoints: [join(native, 'src/index.ts')], globalName: '__maplibreModule'});
    const license = await readFile(join(upstream, 'LICENSE.txt'), 'utf8');
    const bundle = '/*!\n' + license + '\n*/\n' + main.outputFiles[0].text
        + '\nvar maplibregl=__maplibreModule.default;\n'
        + 'maplibregl.workerUrl=URL.createObjectURL(new Blob([' + JSON.stringify(worker.outputFiles[0].text) + '],{type:"text/javascript"}));\n';
    await mkdir(output, {recursive: true});
    await writeFile(join(output, 'maplibre-gl.js'), bundle);
    if (!process.argv.includes('--vendor')) await writeFile(join(output, 'build.json'), JSON.stringify({maplibre: version, capability: 'profile-v1', bytes: Buffer.byteLength(bundle)}, null, 2) + '\n');
    console.log(`已生成 ${join(output, 'maplibre-gl.js')}（${Buffer.byteLength(bundle)} 字节）`);
    // 测试复用构建后的原生源码，避免只验证独立的近似算法。
    if (process.argv.includes('--test')) {
        await build({...shared, platform: 'node', format: 'esm', minify: false,
            stdin: {contents: (await readFile(join(experiment, 'native.test.ts'), 'utf8')).replaceAll('__NATIVE__', native), resolveDir: project, loader: 'ts'},
            outfile: join(temporary, 'native-test.mjs'), write: true});
        execFileSync(process.execPath, [join(temporary, 'native-test.mjs')], {stdio: 'inherit'});
    }
} finally {
    await rm(temporary, {recursive: true, force: true});
}
