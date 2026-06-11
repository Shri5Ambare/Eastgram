import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../models/models.dart';
import '../services/auth_service.dart';
import '../services/chat_service.dart';
import '../services/notification_service.dart';

class AuthProvider extends ChangeNotifier {
  final AuthService authService;
  final ChatService chatService;
  final ApiClient apiClient;
  final NotificationService notificationService = NotificationService();

  User? _currentUser;
  bool _isLoading = false;
  bool _isInitialized = false;
  String? _error;

  User? get currentUser => _currentUser;
  bool get isLoggedIn => _currentUser != null;
  bool get isLoading => _isLoading;
  bool get isInitialized => _isInitialized;
  String? get error => _error;

  AuthProvider({
    required this.authService,
    required this.chatService,
    required this.apiClient,
  }) {
    // Bind API client unauthorized callback to logout
    apiClient.onUnauthorized = logout;
    checkAuthStatus();
  }

  Future<void> checkAuthStatus() async {
    _isLoading = true;
    notifyListeners();

    try {
      final token = await apiClient.tokenStorage.getAccessToken();
      if (token != null) {
        final response = await apiClient.dio.get('/users/me');
        _currentUser = User.fromJson(response.data['data'] as Map<String, dynamic>);
        chatService.connectSocket(token);

        // Initialize Firebase and register FCM token
        await notificationService.initialize();
        final fcmToken = await notificationService.getDeviceToken();
        if (fcmToken != null) {
          await notificationService.registerDevice(token: fcmToken, apiClient: apiClient);
        }
      }
    } catch (_) {
      // Clear tokens on fail
      await apiClient.tokenStorage.clearTokens();
      _currentUser = null;
    } finally {
      _isLoading = false;
      _isInitialized = true;
      notifyListeners();
    }
  }

  Future<bool> login(String identifier, String password) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      _currentUser = await authService.login(identifier: identifier, password: password);
      
      final token = await apiClient.tokenStorage.getAccessToken();
      if (token != null) {
        chatService.connectSocket(token);

        // Initialize Firebase and register FCM token
        await notificationService.initialize();
        final fcmToken = await notificationService.getDeviceToken();
        if (fcmToken != null) {
          await notificationService.registerDevice(token: fcmToken, apiClient: apiClient);
        }
      }
      
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> register({
    required String email,
    required String username,
    required String password,
    required String fullName,
    required String schoolId,
    String? classId,
  }) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      await authService.register(
        email: email,
        username: username,
        password: password,
        fullName: fullName,
        schoolId: schoolId,
        classId: classId,
      );
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    _isLoading = true;
    notifyListeners();

    try {
      // Unregister FCM device token on logout
      final fcmToken = await notificationService.getDeviceToken();
      if (fcmToken != null) {
        await notificationService.unregisterDevice(token: fcmToken, apiClient: apiClient);
      }

      chatService.disconnectSocket();
      await authService.logout();
    } catch (_) {
      // Silent error
    } finally {
      _currentUser = null;
      _isLoading = false;
      notifyListeners();
    }
  }
}
