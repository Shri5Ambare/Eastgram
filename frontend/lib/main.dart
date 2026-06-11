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
  await Firebase.initializeApp();

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
        ChangeNotifierProvider(
          create: (_) => FeedProvider(postService: postService),
        ),
        ChangeNotifierProvider(
          create: (_) => ChatProvider(chatService: chatService),
        ),
      ],
      child: const MyApp(),
    ),
  );
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

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
          return auth.isLoggedIn ? const MainNavigation() : const LoginScreen();
        },
      ),
    );
  }
}
