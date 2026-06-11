import 'package:dio/dio.dart';
import 'config.dart';
import 'token_storage.dart';

class ApiClient {
  late final Dio dio;
  final TokenStorage tokenStorage;
  void Function()? onUnauthorized;

  ApiClient({required this.tokenStorage, this.onUnauthorized}) {
    dio = Dio(
      BaseOptions(
        baseUrl: AppConfig.apiBaseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 15),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );

    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await tokenStorage.getAccessToken();
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          return handler.next(options);
        },
        onError: (DioException error, handler) async {
          if (error.response?.statusCode == 401) {
            final refreshToken = await tokenStorage.getRefreshToken();
            if (refreshToken != null) {
              try {
                // Try rotating tokens using a separate Dio client
                final refreshResponse = await Dio().post(
                  '${AppConfig.apiBaseUrl}/auth/refresh',
                  data: {'refreshToken': refreshToken},
                );

                if (refreshResponse.statusCode == 200 || refreshResponse.statusCode == 201) {
                  final data = refreshResponse.data['data'];
                  final newAccess = data['accessToken'];
                  final newRefresh = data['refreshToken'];

                  await tokenStorage.saveTokens(
                    accessToken: newAccess,
                    refreshToken: newRefresh,
                  );

                  // Clone and retry original request
                  final options = error.requestOptions;
                  options.headers['Authorization'] = 'Bearer $newAccess';
                  final response = await dio.fetch(options);
                  return handler.resolve(response);
                }
              } catch (e) {
                // Refresh failed
                await tokenStorage.clearTokens();
                onUnauthorized?.call();
              }
            } else {
              await tokenStorage.clearTokens();
              onUnauthorized?.call();
            }
          }
          return handler.next(error);
        },
      ),
    );
  }
}
