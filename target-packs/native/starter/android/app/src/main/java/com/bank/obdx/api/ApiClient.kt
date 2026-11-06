package com.bank.obdx.api

import com.bank.obdx.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.CookieHandler
import java.net.CookieManager
import java.net.CookiePolicy
import java.net.HttpURLConnection
import java.net.URL

/** Where the bank's OBDX REST services are (https), and the nonce OBDX asks for on calls that change something. */
object ApiConfig {
    var baseUrl: String = BuildConfig.OBDX_BASE_URL
    var timeoutMs: Int = 30_000
    /** An empty url turns the nonce off (for a mock server). Match both to the bank's OBDX release. */
    var nonceUrl: String = "/digx/v1/session/nonce"
    var nonceHeader: String = "X-Nonce"
}

/** An error answer from an OBDX service, or a network failure (status 0). */
class ApiError(val status: Int, override val message: String, val body: String? = null) : Exception(message)

/**
 * Calls OBDX REST services and returns their JSON answers. The session cookie is kept in memory (never written to the
 * device) and sent with every call; a fresh nonce goes with every call that changes something.
 */
class ApiClient {
    init {
        if (CookieHandler.getDefault() == null) {
            CookieHandler.setDefault(CookieManager(null, CookiePolicy.ACCEPT_ORIGINAL_SERVER))
        }
    }

    suspend fun get(path: String): JSONObject = request("GET", path, null)
    suspend fun post(path: String, body: JSONObject): JSONObject = request("POST", path, body)
    suspend fun put(path: String, body: JSONObject): JSONObject = request("PUT", path, body)
    suspend fun delete(path: String): JSONObject = request("DELETE", path, null)

    private suspend fun request(method: String, path: String, body: JSONObject?): JSONObject = withContext(Dispatchers.IO) {
        val headers = if (method == "GET") emptyMap() else nonce()
        val (status, text) = send(method, path, headers, body)
        val json = if (text.isBlank()) JSONObject() else JSONObject(text)
        if (status !in 200..299) {
            throw ApiError(status, messageOf(json) ?: "The request failed ($status).", text)
        }
        json
    }

    private fun nonce(): Map<String, String> {
        if (ApiConfig.nonceUrl.isEmpty()) return emptyMap()
        val connection = open("POST", ApiConfig.nonceUrl, emptyMap())
        try {
            connection.outputStream.close()
            val value = connection.getHeaderField(ApiConfig.nonceHeader)
            if (connection.responseCode !in 200..299 || value.isNullOrEmpty()) {
                throw ApiError(connection.responseCode, "The bank did not accept the request. Sign in again and try once more.")
            }
            return mapOf(ApiConfig.nonceHeader to value)
        } catch (e: IOException) {
            throw ApiError(0, "The bank could not be reached. Check your connection and try again.")
        } finally {
            connection.disconnect()
        }
    }

    private fun send(method: String, path: String, headers: Map<String, String>, body: JSONObject?): Pair<Int, String> {
        val connection = open(method, path, headers)
        try {
            if (body != null) {
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toString().toByteArray()) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            return status to (stream?.bufferedReader()?.use { it.readText() } ?: "")
        } catch (e: IOException) {
            throw ApiError(0, "The bank could not be reached. Check your connection and try again.")
        } finally {
            connection.disconnect()
        }
    }

    private fun open(method: String, path: String, headers: Map<String, String>): HttpURLConnection {
        val url = URL(ApiConfig.baseUrl + path)
        require(url.protocol == "https") { "OBDX is called over https only" }
        return (url.openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = ApiConfig.timeoutMs
            readTimeout = ApiConfig.timeoutMs
            doOutput = method != "GET" && method != "DELETE"
            setRequestProperty("Accept", "application/json")
            headers.forEach { (k, v) -> setRequestProperty(k, v) }
        }
    }

    /** OBDX error answers carry their message in status.message.detail or a top-level message. */
    private fun messageOf(json: JSONObject): String? =
        json.optJSONObject("status")?.optJSONObject("message")?.let { it.optString("detail").ifEmpty { it.optString("title") } }?.ifEmpty { null }
            ?: json.optString("message").ifEmpty { null }
}

/** The one client of the app. */
val api = ApiClient()
