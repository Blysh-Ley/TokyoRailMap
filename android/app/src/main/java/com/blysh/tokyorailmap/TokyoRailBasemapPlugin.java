package com.blysh.tokyorailmap;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.content.res.AssetManager;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;

@CapacitorPlugin(name = "TokyoRailBasemap")
public class TokyoRailBasemapPlugin extends Plugin {
    private static final String ASSET_PATH = "public/tiles/kanto.pmtiles";
    private static final String OUTPUT_DIR = "basemap";
    private static final String OUTPUT_FILE = "kanto.pmtiles";
    private static final int COPY_BUFFER_SIZE = 1024 * 1024;
    private static final int MAX_RANGE_LENGTH = 1024 * 1024 * 8;

    @PluginMethod
    public void prepare(PluginCall call) {
        try {
            File archive = ensureArchiveFile();
            JSObject result = new JSObject();
            result.put("ok", true);
            result.put("path", archive.getAbsolutePath());
            result.put("size", archive.length());
            call.resolve(result);
        } catch (IOException e) {
            call.reject("Unable to prepare bundled PMTiles archive", e);
        }
    }

    @PluginMethod
    public void readRange(PluginCall call) {
        Long offsetValue = getNumberLong(call, "offset");
        Long lengthValue = getNumberLong(call, "length");
        if (offsetValue == null || lengthValue == null) {
            call.reject("offset and length are required");
            return;
        }

        long offset = offsetValue;
        long length = lengthValue;
        if (offset < 0 || length <= 0 || length > MAX_RANGE_LENGTH) {
            call.reject("invalid PMTiles range");
            return;
        }

        try {
            File archive = ensureArchiveFile();
            long archiveSize = archive.length();
            if (offset >= archiveSize) {
                call.reject("PMTiles range starts beyond archive size");
                return;
            }

            int readLength = (int) Math.min(length, archiveSize - offset);
            byte[] buffer = new byte[readLength];
            try (RandomAccessFile file = new RandomAccessFile(archive, "r")) {
                file.seek(offset);
                file.readFully(buffer);
            }

            JSObject result = new JSObject();
            result.put("data", Base64.encodeToString(buffer, Base64.NO_WRAP));
            result.put("offset", offset);
            result.put("length", readLength);
            result.put("size", archiveSize);
            result.put("contentRange", "bytes " + offset + "-" + (offset + readLength - 1) + "/" + archiveSize);
            call.resolve(result);
        } catch (IOException e) {
            call.reject("Unable to read PMTiles range", e);
        }
    }

    private Long getNumberLong(PluginCall call, String name) {
        Object value = call.getData().opt(name);
        if (!(value instanceof Number)) {
            return null;
        }

        double doubleValue = ((Number) value).doubleValue();
        if (Double.isNaN(doubleValue) || Double.isInfinite(doubleValue) || Math.floor(doubleValue) != doubleValue) {
            return null;
        }
        return ((Number) value).longValue();
    }

    private File ensureArchiveFile() throws IOException {
        Context context = getContext();
        File dir = new File(context.getFilesDir(), OUTPUT_DIR);
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IOException("Unable to create basemap directory");
        }

        File output = new File(dir, OUTPUT_FILE);
        long assetSize = getAssetSize(context.getAssets());
        if (output.isFile() && output.length() == assetSize) {
            return output;
        }

        File temp = new File(dir, OUTPUT_FILE + ".tmp");
        copyAssetToFile(context.getAssets(), temp);
        if (output.exists() && !output.delete()) {
            throw new IOException("Unable to replace existing basemap archive");
        }
        if (!temp.renameTo(output)) {
            throw new IOException("Unable to finalize basemap archive");
        }
        return output;
    }

    private long getAssetSize(AssetManager assets) throws IOException {
        try (AssetFileDescriptor descriptor = assets.openFd(ASSET_PATH)) {
            return descriptor.getLength();
        } catch (IOException ignored) {
            return getAssetSizeByReading(assets);
        }
    }

    private long getAssetSizeByReading(AssetManager assets) throws IOException {
        try (InputStream input = assets.open(ASSET_PATH, AssetManager.ACCESS_STREAMING)) {
            long total = 0;
            byte[] buffer = new byte[COPY_BUFFER_SIZE];
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
            }
            return total;
        }
    }

    private void copyAssetToFile(AssetManager assets, File output) throws IOException {
        try (
            InputStream input = assets.open(ASSET_PATH, AssetManager.ACCESS_STREAMING);
            FileOutputStream fileOutput = new FileOutputStream(output)
        ) {
            byte[] buffer = new byte[COPY_BUFFER_SIZE];
            int read;
            while ((read = input.read(buffer)) != -1) {
                fileOutput.write(buffer, 0, read);
            }
            fileOutput.getFD().sync();
        }
    }
}
