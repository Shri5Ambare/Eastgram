import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:frontend/core/api_client.dart';
import 'package:frontend/core/token_storage.dart';

class MemoryTokens extends TokenStorage {
  String? access = 'old';
  String? refresh = 'refresh';
  @override Future<String?> getAccessToken() async => access;
  @override Future<String?> getRefreshToken() async => refresh;
  @override Future<void> saveTokens({required String accessToken, required String refreshToken}) async {
    access = accessToken; refresh = refreshToken;
  }
  @override Future<void> clearTokens() async { access = null; refresh = null; }
}

class Adapter implements HttpClientAdapter {
  final Future<ResponseBody> Function(RequestOptions) respond;
  Adapter(this.respond);
  @override Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) => respond(options);
  @override void close({bool force = false}) {}
}

ResponseBody response(int status, Object data) => ResponseBody.fromString(
  jsonEncode(data), status, headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
);
ResponseBody rotated() => response(200, {'data': {'accessToken': 'new', 'refreshToken': 'new-refresh'}});

void main() {
  test('concurrent 401s rotate once and retry both requests with the new token', () async {
    final storage = MemoryTokens();
    final release = Completer<void>();
    final oldRequests = Completer<void>();
    var refreshes = 0;
    var oldCount = 0;
    final refreshDio = Dio()..httpClientAdapter = Adapter((_) async {
      refreshes++; await release.future; return rotated();
    });
    final client = ApiClient(tokenStorage: storage, refreshDio: refreshDio);
    client.dio.httpClientAdapter = Adapter((options) async {
      if (options.headers['Authorization'] == 'Bearer old') {
        if (++oldCount == 2) oldRequests.complete();
        return response(401, {});
      }
      return response(200, {'ok': true});
    });
    final requests = [client.dio.get('/users/me'), client.dio.get('/posts')];
    await oldRequests.future;
    await Future<void>.delayed(Duration.zero);
    release.complete();
    final results = await Future.wait(requests);
    expect(results.every((r) => r.statusCode == 200), isTrue);
    expect(refreshes, 1);
    expect(storage.refresh, 'new-refresh');
  });

  test('a second 401 after retry ends the session without refresh recursion', () async {
    final storage = MemoryTokens();
    var refreshes = 0;
    var expired = 0;
    final client = ApiClient(
      tokenStorage: storage, onUnauthorized: () => expired++,
      refreshDio: Dio()..httpClientAdapter = Adapter((_) async { refreshes++; return rotated(); }),
    );
    client.dio.httpClientAdapter = Adapter((_) async => response(401, {}));
    await expectLater(client.dio.get('/posts'), throwsA(isA<DioException>()));
    expect(refreshes, 1);
    expect(expired, 1);
    expect(storage.access, isNull);
  });

  test('a refresh timeout preserves credentials for an offline retry', () async {
    final storage = MemoryTokens();
    final client = ApiClient(tokenStorage: storage, refreshDio: Dio()..httpClientAdapter = Adapter((options) async {
      throw DioException(requestOptions: options, type: DioExceptionType.connectionTimeout);
    }));
    client.dio.httpClientAdapter = Adapter((_) async => response(401, {}));
    await expectLater(client.dio.get('/posts'), throwsA(isA<DioException>()));
    expect(storage.access, 'old');
    expect(storage.refresh, 'refresh');
  });

  test('rejected refresh clears credentials, while login 401 never refreshes', () async {
    final storage = MemoryTokens();
    var refreshes = 0;
    final client = ApiClient(tokenStorage: storage, refreshDio: Dio()..httpClientAdapter = Adapter((_) async {
      refreshes++; return response(401, {});
    }));
    client.dio.httpClientAdapter = Adapter((_) async => response(401, {}));
    await expectLater(client.dio.post('/auth/login'), throwsA(isA<DioException>()));
    expect(refreshes, 0);
    expect(storage.access, 'old');
    await expectLater(client.dio.get('/users/me'), throwsA(isA<DioException>()));
    expect(refreshes, 1);
    expect(storage.refresh, isNull);
  });

  test('logout during rotation cannot restore credentials or reconnect a socket', () async {
    final storage = MemoryTokens();
    final started = Completer<void>();
    final release = Completer<void>();
    var reconnected = false;
    final client = ApiClient(tokenStorage: storage, refreshDio: Dio()..httpClientAdapter = Adapter((_) async {
      started.complete(); await release.future; return rotated();
    }));
    client.onTokenRefreshed = (_) => reconnected = true;
    final rotation = client.refreshAccessToken();
    await started.future;
    final logout = client.endSession();
    release.complete();
    expect(await rotation, isNull);
    await logout;
    expect(storage.access, isNull);
    expect(storage.refresh, isNull);
    expect(reconnected, isFalse);
  });
}
