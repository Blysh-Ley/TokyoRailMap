import { compileStationFrameFilter, stationFramePointToLngLat } from '../domain/stationFrameGeometry.js';
import { projectTransferCapsuleFrameGeometry } from '../domain/transferCapsuleFrameGeometry.js';

const VERTEX = `attribute vec2 a_center;
attribute vec2 a_local;
attribute vec2 a_direction;
attribute vec2 a_shape;
attribute vec4 a_color;
uniform vec2 u_viewport;
varying vec2 v_local;
varying vec2 v_shape;
varying vec4 v_color;
void main() {
    vec2 pixel = vec2(a_direction.x*a_local.x-a_direction.y*a_local.y,
        a_direction.y*a_local.x+a_direction.x*a_local.y);
    gl_Position = vec4(a_center + pixel*vec2(2.0,-2.0)/u_viewport,0.0,1.0);
    v_local=a_local; v_shape=a_shape; v_color=a_color;
}`;
const FRAGMENT = `precision mediump float;
varying vec2 v_local;
varying vec2 v_shape;
varying vec4 v_color;
void main() {
    float d=length(vec2(max(abs(v_local.x)-v_shape.x,0.0),v_local.y));
    gl_FragColor=v_color*(1.0-smoothstep(v_shape.y-0.5,v_shape.y+0.5,d));
}`;
const CORNERS = [[-1,-1],[1,-1],[-1,1],[-1,1],[1,-1],[1,1]];
const STRIDE = 12;
const color = (c, opacity) => [c.r*opacity,c.g*opacity,c.b*opacity,c.a*opacity];
const clip = (m, p) => {
    const w = m[3]*p.x+m[7]*p.y+m[15];
    return { x:(m[0]*p.x+m[4]*p.y+m[12])/w, y:(m[1]*p.x+m[5]*p.y+m[13])/w, w };
};

// Batched round segments and circles, sharing the station frame projection.
// All native map/style reads are supplied by mapEngine, never performed here.
export function createTransferCapsuleFrameRenderer({ getFrame, getGeometry, onReady, onFailure, onDetach }) {
    let program, buffer, locations;
    let active = false;
    let records = [];
    let projectedGeometry, projectedSourceGeometry, projectedGeometryZoom;
    let vertices = new Float32Array(0);
    const filters = new Map();
    const accepts = (style, feature) => {
        const previous = filters.get(style.id);
        if (!previous || previous.expression !== style.filter) filters.set(style.id,
            { expression:style.filter, test:compileStationFrameFilter(style.filter) });
        return style.visible && filters.get(style.id).test(feature.properties);
    };
    const layer = {
        id:'transfer-capsules-frame-layer',type:'custom',renderingMode:'2d',
        onAdd(_map,gl) {
            const shaders=[];
            try {
                for (const [type,source] of [[gl.VERTEX_SHADER,VERTEX],[gl.FRAGMENT_SHADER,FRAGMENT]]) {
                    const shader=gl.createShader(type); shaders.push(shader);
                    gl.shaderSource(shader,source); gl.compileShader(shader);
                    if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
                }
                program=gl.createProgram(); shaders.forEach((s)=>gl.attachShader(program,s)); gl.linkProgram(program);
                if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
                buffer=gl.createBuffer();
                locations=Object.fromEntries(['center','local','direction','shape','color'].map((name)=>[name,gl.getAttribLocation(program,`a_${name}`)]));
                locations.viewport=gl.getUniformLocation(program,'u_viewport');
                active=true; onReady?.();
            } catch(error) { onFailure(error); }
            finally { shaders.forEach((s)=>gl.deleteShader(s)); }
        },
        render(gl,matrix) {
            if (!active) return;
            try {
                const frame=getFrame(); records=[];
                const batches = new Map(frame.styles.map((s)=>[s.id,[]]));
                const projectPoint = (p) => {
                    const mercator={ ...p.mercator }; mercator.x+=Math.round(frame.centerMercatorX-mercator.x);
                    const c=clip(matrix,mercator);
                    return { ...p, coordinates:stationFramePointToLngLat(mercator), clip:c, screenPoint:{x:(c.x+1)*frame.width/2,y:(1-c.y)*frame.height/2} };
                };
                const push = (style,feature,a,b) => {
                    if (!accepts(style,feature)) return;
                    const value=style.evaluate(feature);
                    const pitchScale=style.type==='circle' && value.pitchScale==='map' ? frame.cameraDistance/a.clip.w : 1;
                    const radius=Math.max(0,value.radius*pitchScale);
                    if (!radius || value.opacity<=0) return;
                    const half=Math.hypot(b.screenPoint.x-a.screenPoint.x,b.screenPoint.y-a.screenPoint.y)/2;
                    if (Math.max(a.screenPoint.x,b.screenPoint.x)+radius<0 || Math.min(a.screenPoint.x,b.screenPoint.x)-radius>frame.width
                        || Math.max(a.screenPoint.y,b.screenPoint.y)+radius<0 || Math.min(a.screenPoint.y,b.screenPoint.y)-radius>frame.height) return;
                    const center=[Math.fround((a.clip.x+b.clip.x)/2),Math.fround((a.clip.y+b.clip.y)/2)];
                    const direction=half>0 ? [Math.fround((b.screenPoint.x-a.screenPoint.x)/(2*half)),Math.fround((b.screenPoint.y-a.screenPoint.y)/(2*half))] : [1,0];
                    const shape=[Math.fround(half),Math.fround(radius)];
                    batches.get(style.id).push({center,direction,shape,fill:color(value.color,value.opacity)});
                    // Record the Float32 endpoints actually passed to the vertex shader.
                    const cx=(center[0]+1)*frame.width/2, cy=(1-center[1])*frame.height/2;
                    records.push({ ...feature, layer:{id:style.id,type:style.type}, radius,
                        endpoints:[a,b].map((p,i)=>({stationId:p.id,coordinates:p.coordinates,
                            screenPoint:{x:cx+(i?1:-1)*direction[0]*shape[0],y:cy+(i?1:-1)*direction[1]*shape[0]}})),
                        renderedZoom:frame.zoom,renderer:'current-frame-capsules' });
                };
                const geometry=getGeometry();
                const geometryZoom=frame.mode==='performance' ? frame.frozenZoom : frame.zoom;
                if (geometry!==projectedSourceGeometry || geometryZoom!==projectedGeometryZoom) {
                    projectedGeometry=projectTransferCapsuleFrameGeometry(geometry,frame.zoom,{mode:frame.mode,frozenZoom:frame.frozenZoom});
                    projectedSourceGeometry=geometry;
                    projectedGeometryZoom=geometryZoom;
                }
                const projected=projectedGeometry;
                for (const group of projected) {
                    const points=new Map(group.points.map((p)=>[p.id,projectPoint(p)]));
                    const feature={type:'Feature',properties:group.properties};
                    if (group.fallback) {
                        const first=points.values().next().value;
                        for (const style of frame.styles.filter((s)=>s.role==='fallback')) push(style,feature,first,first);
                    } else for (const [a,b] of group.edges) {
                        for (const style of frame.styles.filter((s)=>s.role==='line')) push(style,feature,points.get(a.id),points.get(b.id));
                    }
                    for (const p of points.values()) for (const style of frame.styles.filter((s)=>s.role==='dot')) push(style,p.feature,p,p);
                }
                const shapes=frame.styles.flatMap((s)=>batches.get(s.id));
                const length=shapes.length*6*STRIDE;
                if (vertices.length<length) vertices=new Float32Array(Math.max(length,vertices.length*2));
                let index=0;
                for (const p of shapes) for (const [x,y] of CORNERS) {
                    vertices.set([...p.center,x*(p.shape[0]+p.shape[1]+1),y*(p.shape[1]+1),...p.direction,...p.shape,...p.fill],index); index+=STRIDE;
                }
                if (gl.bindVertexArray) gl.bindVertexArray(null); else gl.getExtension('OES_vertex_array_object')?.bindVertexArrayOES(null);
                gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER,buffer); gl.bufferData(gl.ARRAY_BUFFER,vertices.subarray(0,length),gl.DYNAMIC_DRAW);
                let offset=0;
                for (const [name,size] of [['center',2],['local',2],['direction',2],['shape',2],['color',4]]) {
                    gl.enableVertexAttribArray(locations[name]); gl.vertexAttribPointer(locations[name],size,gl.FLOAT,false,STRIDE*4,offset*4); offset+=size;
                }
                gl.uniform2f(locations.viewport,frame.width,frame.height); gl.disable(gl.DEPTH_TEST); gl.disable(gl.STENCIL_TEST);
                gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA); gl.drawArrays(gl.TRIANGLES,0,shapes.length*6);
            } catch(error) { active=false; records=[]; onFailure(error); }
        },
        onRemove(_map,gl) { active=false; records=[]; projectedGeometry=null; projectedSourceGeometry=null;
            if(buffer)gl.deleteBuffer(buffer); if(program)gl.deleteProgram(program); onDetach?.(); }
    };
    return {layer,isActive:()=>active,getRecords:()=>records};
}
