import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'package:firebase_core/firebase_core.dart';

import 'core/api_client.dart';
import 'core/token_storage.dart';
import 'providers/auth_provider.dart';
import 'providers/feed_provider.dart';
import 'providers/chat_provider.dart';
import 'services/auth_service.dart';
import 'services/post_service.dart';
import 'services/chat_service.dart';
import 'ui/screens/auth/login_screen.dart';
import 'ui/screens/main_navigation.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Firebase.initializeApp();
  } catch (error) {
    debugPrint('Push notifications unavailable: $error');
  }

  final tokenStorage = TokenStorage();
  final apiClient = ApiClient(tokenStorage: tokenStorage);

  final authService = AuthService(apiClient: apiClient);
  final postService = PostService(apiClient: apiClient);
  final chatService = ChatService(apiClient: apiClient);

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(
          create: (_) => AuthProvider(
            authService: authService,
            chatService: chatService,
            apiClient: apiClient,
          ),
        ),
      ],
      child: MyApp(postService: postService, chatService: chatService),
    ),
  );
}

class MyApp extends StatelessWidget {
  final PostService? postService;
  final ChatService? chatService;

  const MyApp({super.key, this.postService, this.chatService});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'EduGram',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF764BA2),
          primary: const Color(0xFF764BA2),
          secondary: const Color(0xFF667EEA),
        ),
        useMaterial3: true,
        scaffoldBackgroundColor: Colors.white,
      ),
      home: Consumer<AuthProvider>(
        builder: (context, auth, _) {
          if (!auth.isInitialized) {
            return const Scaffold(
              body: Center(
                child: CircularProgressIndicator(),
              ),
            );
          }
          if (!auth.isLoggedIn) return const LoginScreen();
          // Account-scoped caches are destroyed on logout or account change.
          return MultiProvider(
            key: ValueKey(auth.currentUser!.id),
            providers: [
              ChangeNotifierProvider(create: (_) => FeedProvider(
                postService: postService ?? PostService(apiClient: auth.apiClient),
              )),
              ChangeNotifierProvider(create: (_) => ChatProvider(
                chatService: chatService ?? auth.chatService,
              )),
            ],
            child: const MainNavigation(),
          );
        },
      ),
    );
  }
}
