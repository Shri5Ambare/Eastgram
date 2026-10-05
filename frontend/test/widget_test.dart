import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:frontend/core/api_client.dart';
import 'package:frontend/main.dart';
import 'package:frontend/providers/auth_provider.dart';
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
}
