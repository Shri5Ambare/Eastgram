import 'package:flutter_test/flutter_test.dart';
import 'package:frontend/core/api_client.dart';
import 'package:frontend/providers/auth_provider.dart';
import 'package:frontend/services/auth_service.dart';
import 'package:frontend/services/chat_service.dart';
import 'package:frontend/services/notification_service.dart';
import 'api_client_test.dart' show MemoryTokens, Adapter, response;

class FakeChat extends ChatService {
  String? token;
  FakeChat(ApiClient client) : super(apiClient: client);
  @override void connectSocket(String value) { token = value; }
  @override void disconnectSocket() { token = null; }
}
class BrokenPush extends NotificationService {
  @override Future<void> initialize() async { throw StateError('push unavailable'); }
  @override Future<String?> getDeviceToken() async { throw StateError('push unavailable'); }
}

void main() {
  test('push failure does not break login, and logout clears credentials and revokes refresh', () async {
    final storage = MemoryTokens()..access = null..refresh = null;
    final client = ApiClient(tokenStorage: storage);
    String? revoked;
    client.dio.httpClientAdapter = Adapter((options) async {
      if (options.path == '/auth/login') { return response(200, {'data': {
        'accessToken': 'access', 'refreshToken': 'refresh',
        'user': {'id': 'u', 'schoolId': 's', 'email': 'u@example.test', 'username': 'user',
          'fullName': 'User', 'role': 'STUDENT', 'status': 'ACTIVE'},
      }}); }
      if (options.path == '/auth/logout') { revoked = options.data['refreshToken'] as String; return response(200, {}); }
      return response(401, {});
    });
    final chat = FakeChat(client);
    final provider = AuthProvider(
      authService: AuthService(apiClient: client), chatService: chat, apiClient: client,
      notificationService: BrokenPush(),
    );
    while (!provider.isInitialized) { await Future<void>.delayed(Duration.zero); }
    expect(await provider.login('user', 'password'), isTrue);
    expect(provider.isLoggedIn, isTrue);
    expect(chat.token, 'access');
    await provider.logout();
    expect(provider.isLoggedIn, isFalse);
    expect(chat.token, isNull);
    expect(storage.access, isNull);
    expect(storage.refresh, isNull);
    expect(revoked, 'refresh');
    provider.dispose();
    chat.dispose();
  });
}
