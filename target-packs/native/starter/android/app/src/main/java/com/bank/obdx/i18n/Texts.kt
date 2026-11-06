package com.bank.obdx.i18n

import org.json.JSONObject

/** The texts of shared/i18n/en.json (on the classpath), read once. Add languages as more JSON files beside it. */
object Texts {
    private val texts: JSONObject by lazy {
        val stream = Texts::class.java.getResourceAsStream("/i18n/en.json") ?: return@lazy JSONObject()
        JSONObject(stream.bufferedReader().use { it.readText() })
    }

    fun find(key: String): String? {
        var node: Any? = texts
        for (part in key.split('.')) {
            node = (node as? JSONObject)?.opt(part) ?: return null
        }
        return node as? String
    }
}

/** The text for a key such as "fundTransfer.remarks", with {name} placeholders filled in; the key when it is missing. */
fun t(key: String, vararg values: Pair<String, Any>): String {
    var text = Texts.find(key) ?: key
    for ((name, value) in values) {
        text = text.replace("{$name}", value.toString())
    }
    return text
}
