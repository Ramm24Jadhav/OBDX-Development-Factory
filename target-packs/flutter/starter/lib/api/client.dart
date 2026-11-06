import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart' show rootBundle;
import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';

import 'config.dart';

/// An error answer from an OBDX service, or a network failure (status 0).
class ApiError implements Exception {
  ApiError(this.status, this.message, [this.body]);

  final int status;
  final String message;
  final Object? body;

  @override
  String toString() => 'ApiError($status): $message';
}

/// Calls the bank's OBDX REST services. The app keeps the OBDX session cookie itself (there is no browser), sends it
/// with every call and a fresh nonce with every call that changes something; the server certificate can be pinned.
class ApiClient {
  ApiClient({http.Client? client}) : _given = client;

  final http.Client? _given;
  http.Client? _client;
  final Map<String, String> _cookies = {};

  Future<http.Client> _http() async {
    if (_given != null) {
      return _given;
    }
    if (_client != null) {
      return _client!;
    }
    if (ApiConfig.pinnedCertificate.isEmpty) {
      return _client = http.Client();
    }
    // Pinning: only the bank's own certificate is trusted for these calls
    final pem = await rootBundle.load(ApiConfig.pinnedCertificate);
    final context = SecurityContext(withTrustedRoots: false)..setTrustedCertificatesBytes(pem.buffer.asUint8List());
    return _client = IOClient(HttpClient(context: context));
  }

  Future<http.Response> _send(String method, String path, Map<String, String> headers, Object? body) async {
    final request = http.Request(method, Uri.parse(ApiConfig.baseUrl + path))
      ..headers.addAll({'Accept': 'application/json', ...headers});
    if (_cookies.isNotEmpty) {
      request.headers['Cookie'] = _cookies.entries.map((e) => '${e.key}=${e.value}').join('; ');
    }
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }
    try {
      final client = await _http();
      final response = await http.Response.fromStream(await client.send(request).timeout(ApiConfig.timeout));
      _keepCookies(response.headers['set-cookie']);
      return response;
    } on TimeoutException {
      throw ApiError(0, 'The bank did not answer in time. Check your connection and try again.');
    } on IOException {
      throw ApiError(0, 'The bank could not be reached. Check your connection and try again.');
    }
  }

  /// Keeps the session cookie (and any other the bank sets) for the next calls.
  void _keepCookies(String? header) {
    if (header == null) {
      return;
    }
    for (final part in header.split(RegExp(r',(?=[^;]+?=)'))) {
      final pair = part.split(';').first.trim();
      final at = pair.indexOf('=');
      if (at > 0) {
        _cookies[pair.substring(0, at)] = pair.substring(at + 1);
      }
    }
  }

  /// A fresh nonce for one call that changes something (OBDX refuses such a call without it).
  Future<Map<String, String>> _nonce() async {
    if (ApiConfig.nonceUrl.isEmpty) {
      return {};
    }
    final response = await _send('POST', ApiConfig.nonceUrl, {}, null);
    final value = response.headers[ApiConfig.nonceHeader.toLowerCase()];
    if (response.statusCode >= 400 || value == null) {
      throw ApiError(response.statusCode, 'The bank did not accept the request. Sign in again and try once more.');
    }
    return {ApiConfig.nonceHeader: value};
  }

  /// Calls an OBDX REST service and returns its JSON answer (a map, a list or null).
  Future<Object?> request(String method, String path, [Object? body]) async {
    final headers = method == 'GET' ? <String, String>{} : await _nonce();
    final response = await _send(method, path, headers, body);
    final Object? data = response.body.isEmpty ? null : jsonDecode(response.body);
    if (response.statusCode >= 400) {
      throw ApiError(response.statusCode, _messageOf(data) ?? 'The request failed (${response.statusCode}).', data);
    }
    return data;
  }

  /// OBDX error answers carry their message in status.message.detail or a top-level message.
  static String? _messageOf(Object? data) {
    if (data is! Map<String, Object?>) {
      return null;
    }
    final status = data['status'];
    if (status is Map<String, Object?> && status['message'] is Map<String, Object?>) {
      final message = status['message']! as Map<String, Object?>;
      return (message['detail'] ?? message['title']) as String?;
    }
    return data['message'] as String?;
  }

  Future<Object?> get(String path) => request('GET', path);
  Future<Object?> post(String path, [Object? body]) => request('POST', path, body);
  Future<Object?> put(String path, [Object? body]) => request('PUT', path, body);
  Future<Object?> delete(String path) => request('DELETE', path);
}

/// The app's one client: screens call OBDX only through the module API files in lib/api, which use it.
final api = ApiClient();
