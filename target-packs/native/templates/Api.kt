/*
 * <<Module>> services of OBDX, used by the <<module>> screens. Paths and field names as in the bank's OBDX REST services.
 */
package com.bank.obdx.api

import org.json.JSONObject

/** <<What is sent>>. */
data class <<Name>>Request(val <<field>>: String) {
    fun toJson(): JSONObject = JSONObject().put("<<field>>", <<field>>)
}

/** <<What comes back>>. */
data class <<Name>>Response(val <<field>>: String) {
    companion object {
        fun fromJson(json: JSONObject) = <<Name>>Response(<<field>> = json.getString("<<field>>"))
    }
}

/** <<What the call does>>: <<METHOD and path of the OBDX service>>. */
suspend fun <<name>>(request: <<Name>>Request): <<Name>>Response =
    <<Name>>Response.fromJson(api.post("<<path>>", request.toJson()))
