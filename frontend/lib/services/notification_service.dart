import 'dart:io';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import '../core/api_client.dart';

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

class NotificationService {
  bool _initialized = false;

  Future<void> initialize() async {
    if (_initialized) return;

    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

    final messaging = FirebaseMessaging.instance;
    await messaging.requestPermission(
      alert: true,
      announcement: false,
      badge: true,
      carPlay: false,
      criticalAlert: false,
      provisional: false,
      sound: true,
    );

    // Listen to foreground messages
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      // Foreground notification payload can be broadcasted or logged
    });

    _initialized = true;
  }

  Future<String?> getDeviceToken() async {
    try {
      return await FirebaseMessaging.instance.getToken();
    } catch (_) {
      return null;
    }
  }

  Future<void> registerDevice({
    required String token,
    required ApiClient apiClient,
  }) async {
    try {
      String platform = 'web';
      if (!kIsWeb) {
        if (Platform.isAndroid) {
          platform = 'android';
        } else if (Platform.isIOS) {
          platform = 'ios';
        } else if (Platform.isWindows) {
          platform = 'windows';
        } else if (Platform.isMacOS) {
          platform = 'macos';
        } else if (Platform.isLinux) {
          platform = 'linux';
        }
      }

      await apiClient.dio.post('/notifications/devices', data: {
        'fcmToken': token,
        'platform': platform,
      });
    } catch (_) {
      // Silent error during background registration
    }
  }

  Future<void> unregisterDevice({
    required String token,
    required ApiClient apiClient,
  }) async {
    try {
      await apiClient.dio.delete('/notifications/devices/$token');
    } catch (_) {
      // Silent error during logout
    }
  }
}
