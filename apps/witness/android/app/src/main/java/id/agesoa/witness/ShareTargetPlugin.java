package id.agesoa.witness;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Hands a post shared from another app (ACTION_SEND, text/plain) to the web app. The share that launched the app is
 * read once with pending(); a share that reaches the running app (singleTask, onNewIntent) is sent as the
 * "shareReceived" event. Only the shared text and subject are read: no storage or other permission is involved.
 */
@CapacitorPlugin(name = "ShareTarget")
public class ShareTargetPlugin extends Plugin {

    private JSObject launch;

    @Override
    public void load() {
        launch = fields(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        JSObject shared = fields(intent);
        if (shared != null) {
            notifyListeners("shareReceived", shared, true);
        }
    }

    @PluginMethod
    public void pending(PluginCall call) {
        JSObject shared = launch != null ? launch : new JSObject();
        launch = null;
        call.resolve(shared);
    }

    /** The shared fields of a text share, or null for any other intent. The intent is cleared so it is not read twice. */
    private static JSObject fields(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) {
            return null;
        }
        String type = intent.getType();
        if (type == null || !type.startsWith("text/")) {
            return null;
        }
        JSObject out = new JSObject();
        out.put("text", intent.getStringExtra(Intent.EXTRA_TEXT));
        out.put("title", intent.getStringExtra(Intent.EXTRA_SUBJECT));
        intent.setAction(Intent.ACTION_MAIN);
        intent.removeExtra(Intent.EXTRA_TEXT);
        intent.removeExtra(Intent.EXTRA_SUBJECT);
        return out;
    }
}
