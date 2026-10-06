import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:frontend/core/api_client.dart';
import 'package:frontend/main.dart';
import 'package:frontend/providers/auth_provider.dart';
import 'package:frontend/providers/feed_provider.dart';
import 'package:frontend/providers/chat_provider.dart';
import 'package:frontend/ui/screens/main_navigation.dart';
import 'package:frontend/services/auth_service.dart';
import 'api_client_test.dart' show MemoryTokens, Adapter, response;
import 'auth_provider_test.dart' show FakeChat, BrokenPush;

void main() {
  testWidgets('signed-out app renders the actual login form', (tester) async {
    final storage = MemoryTokens()..access = null..refresh = null;
    final client = ApiClient(tokenStorage: storage);
    client.dio.httpClientAdapter = Adapter((_) async => response(401, {}));
    final chat = FakeChat(client);
    final provider = AuthProvider(
      authService: AuthService(apiClient: client), chatService: chat,
      apiClient: client, notificationService: BrokenPush(),
    );
    await tester.pumpWidget(ChangeNotifierProvider.value(value: provider, child: const MyApp()));
    await tester.pumpAndSettle();
    expect(find.byType(TextFormField), findsNWidgets(2));
    expect(find.textContaining('EduGram'), findsWidgets);
    await tester.pumpWidget(const SizedBox.shrink());
    provider.dispose();
    chat.dispose();
  });
  testWidgets('feed and chat caches are recreated when the account changes', (tester) async {
    final storage = MemoryTokens()..access = null..refresh = null;
    final client = ApiClient(tokenStorage: storage);
    var userId = 'first';
    client.dio.httpClientAdapter = Adapter((options) async {
      if (options.path == '/auth/login') {
        return response(200, {'data': {
          'accessToken': userId, 'refreshToken': 'refresh-$userId',
          'user': {'id': userId, 'schoolId': 'school', 'email': '$userId@example.test',
            'username': userId, 'fullName': userId, 'role': 'STUDENT', 'status': 'ACTIVE'},
        }});
      }
      if (options.path == '/stories') return response(200, {'data': []});
      return response(200, {'items': [], 'data': {}});
    });
    final chat = FakeChat(client);
    final auth = AuthProvider(
      authService: AuthService(apiClient: client), chatService: chat,
      apiClient: client, notificationService: BrokenPush(),
    );
    await tester.pumpWidget(ChangeNotifierProvider.value(value: auth, child: const MyApp()));
    await tester.pumpAndSettle();
    await tester.runAsync(() => auth.login('first', 'password'));
    await tester.pumpAndSettle();
    final firstContext = tester.element(find.byType(MainNavigation));
    final firstFeed = Provider.of<FeedProvider>(firstContext, listen: false);
    final firstChat = Provider.of<ChatProvider>(firstContext, listen: false);
    await tester.runAsync(auth.logout);
    await tester.pumpAndSettle();
    userId = 'second';
    await tester.runAsync(() => auth.login('second', 'password'));
    await tester.pumpAndSettle();
    final secondContext = tester.element(find.byType(MainNavigation));
    expect(identical(firstFeed, Provider.of<FeedProvider>(secondContext, listen: false)), isFalse);
    expect(identical(firstChat, Provider.of<ChatProvider>(secondContext, listen: false)), isFalse);
    await tester.pumpWidget(const SizedBox.shrink());
    auth.dispose();
    chat.dispose();
  });
}
