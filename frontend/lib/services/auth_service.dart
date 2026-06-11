import 'package:dio/dio.dart';
import '../core/api_client.dart';
import '../models/models.dart';

class AuthService {
  final ApiClient apiClient;

  AuthService({required this.apiClient});

  Future<User> login({required String identifier, required String password}) async {
    try {
      final response = await apiClient.dio.post('/auth/login', data: {
        'identifier': identifier,
        'password': password,
      });

      final responseData = response.data['data'];
      final accessToken = responseData['accessToken'] as String;
      final refreshToken = responseData['refreshToken'] as String;

      await apiClient.tokenStorage.saveTokens(
        accessToken: accessToken,
        refreshToken: refreshToken,
      );

      return User.fromJson(responseData['user'] as Map<String, dynamic>);
    } on DioException catch (e) {
      final message = e.response?.data['message'] ?? 'Authentication failed';
      throw Exception(message);
    }
  }

  Future<User> register({
    required String email,
    required String username,
    required String password,
    required String fullName,
    required String schoolId,
    String? classId,
  }) async {
    try {
      final response = await apiClient.dio.post('/auth/register', data: {
        'email': email,
        'username': username,
        'password': password,
        'fullName': fullName,
        'schoolId': schoolId,
        if (classId != null) 'classId': classId,
      });

      return User.fromJson(response.data['data'] as Map<String, dynamic>);
    } on DioException catch (e) {
      final message = e.response?.data['message'] ?? 'Registration failed';
      throw Exception(message);
    }
  }

  Future<void> logout() async {
    try {
      final refreshToken = await apiClient.tokenStorage.getRefreshToken();
      if (refreshToken != null) {
        await apiClient.dio.post('/auth/logout', data: {
          'refreshToken': refreshToken,
        });
      }
    } catch (_) {
      // Ignore network errors during logout
    } finally {
      await apiClient.tokenStorage.clearTokens();
    }
  }
}
