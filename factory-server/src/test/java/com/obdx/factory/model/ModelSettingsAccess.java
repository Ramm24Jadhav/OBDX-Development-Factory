package com.obdx.factory.model;

/** Lets tests of other packages check a model server address as the Models page does (ModelSettings.plainServerUrl). */
public final class ModelSettingsAccess {

    private ModelSettingsAccess() {
    }

    public static void plainServerUrl(String url) {
        ModelSettings.plainServerUrl(url);
    }
}
