import 'package:dio/dio.dart';
import 'config.dart';
import 'token_storage.dart';

class ApiClient {
  late final Dio dio;
  final Dio _refreshDio;
  final TokenStorage tokenStorage;
  void Function()? onUnauthorized;
  void Function(String token)? onTokenRefreshed;
  Future<String?>? _refreshFuture;
  int _sessionEpoch = 0;
  bool _sessionEnding = false;

  ApiClient({required this.tokenStorage, this.onUnauthorized, Dio? refreshDio})
      : _refreshDio = refreshDio ?? Dio(BaseOptions(
          connectTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 15),
        )) {
    dio = Dio(BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
    ));
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        try {
          final token = await tokenStorage.getAccessToken();
          if (token != null) options.headers['Authorization'] = 'Bearer $token';
          handler.next(options);
        } catch (error) {
          handler.reject(DioException(requestOptions: options, error: error));
        }
      },
      onError: (error, handler) async {
        final options = error.requestOptions;
        if (error.response?.statusCode != 401 || options.path.startsWith('/auth/') || _sessionEnding) {
          handler.next(error);
          return;
        }
        if (options.extra['sessionRetry'] == true) {
          await _invalidateSession();
          handler.next(error);
          return;
        }
        try {
          // A delayed 401 may refer to the token already replaced by another request.
          var access = await tokenStorage.getAccessToken();
          if (access == null || options.headers['Authorization'] == 'Bearer $access') {
            access = await refreshAccessToken();
          }
          if (access == null) { handler.next(error); return; }
          options.extra['sessionRetry'] = true;
          options.headers['Authorization'] = 'Bearer $access';
          handler.resolve(await dio.fetch(options));
        } on DioException catch (retryError) {
          handler.next(retryError);
        } catch (_) {
          handler.next(error);
        }
      },
    ));
  }

  Future<String?> refreshAccessToken() async {
    final running = _refreshFuture ??= _rotateTokens();
    try { return await running; }
    finally { if (identical(_refreshFuture, running)) _refreshFuture = null; }
  }

  Future<String?> _rotateTokens() async {
    final epoch = _sessionEpoch;
    final refresh = await tokenStorage.getRefreshToken();
    if (_sessionEnding || epoch != _sessionEpoch) return null;
    if (refresh == null) { await _invalidateSession(); return null; }
    try {
      final response = await _refreshDio.post(
        '${AppConfig.apiBaseUrl}/auth/refresh', data: {'refreshToken': refresh},
      );
      final data = response.data['data'];
      final access = data['accessToken'] as String;
      final replacement = data['refreshToken'] as String;
      if (epoch != _sessionEpoch) return null;
      await tokenStorage.saveTokens(accessToken: access, refreshToken: replacement);
      if (epoch != _sessionEpoch) return null;
      onTokenRefreshed?.call(access);
      return access;
    } on DioException catch (error) {
      // Offline/timeouts preserve credentials; only server rejection ends the session.
      if (epoch == _sessionEpoch &&
          (error.response?.statusCode == 401 || error.response?.statusCode == 403)) {
        await _invalidateSession();
        return null;
      }
      rethrow;
    }
  }

  Future<void> _invalidateSession() async {
    _sessionEpoch++;
    await tokenStorage.clearTokens();
    onUnauthorized?.call();
  }

  // End local access immediately, then let any outstanding secure-storage write finish.
  Future<String?> endSession({bool clearTokens = true}) async {
    _sessionEnding = true;
    _sessionEpoch++;
    final pending = _refreshFuture;
    if (pending != null) {
      try { await pending; } catch (_) {}
    }
    final refresh = await tokenStorage.getRefreshToken();
    if (clearTokens) await tokenStorage.clearTokens();
    return refresh;
  }

  Future<void> saveSession({required String accessToken, required String refreshToken}) async {
    await endSession();
    await tokenStorage.saveTokens(accessToken: accessToken, refreshToken: refreshToken);
    _sessionEnding = false;
  }
}
