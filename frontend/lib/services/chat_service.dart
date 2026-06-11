import 'dart:async';
import 'package:dio/dio.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../core/api_client.dart';
import '../core/config.dart';
import '../models/models.dart';

class ChatService {
  final ApiClient apiClient;
  io.Socket? _socket;
  
  final _messageController = StreamController<Message>.broadcast();
  final _readController = StreamController<Map<String, dynamic>>.broadcast();

  Stream<Message> get messageStream => _messageController.stream;
  Stream<Map<String, dynamic>> get readStream => _readController.stream;

  ChatService({required this.apiClient});

  void connectSocket(String token) {
    _socket?.disconnect();

    _socket = io.io(
      AppConfig.socketUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableAutoConnect()
          .build(),
    );

    _socket!.onConnect((_) {
      // socket connected
    });

    _socket!.onDisconnect((_) {
      // socket disconnected
    });

    _socket!.on('message:new', (data) {
      try {
        final message = Message.fromJson(data as Map<String, dynamic>);
        _messageController.add(message);
      } catch (_) {
        // Handle parsing errors
      }
    });

    _socket!.on('message:read', (data) {
      try {
        _readController.add(data as Map<String, dynamic>);
      } catch (_) {
        // Handle parsing errors
      }
    });
  }

  void disconnectSocket() {
    _socket?.disconnect();
    _socket = null;
  }

  Future<List<Conversation>> getConversations({int page = 1, int limit = 10}) async {
    try {
      final response = await apiClient.dio.get('/conversations', queryParameters: {
        'page': page,
        'limit': limit,
      });
      final List items = response.data['items'] ?? [];
      return items.map((x) => Conversation.fromJson(x as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw Exception(e.response?.data['message'] ?? 'Failed to load conversations');
    }
  }

  Future<Conversation> getConversation(String id) async {
    try {
      final response = await apiClient.dio.get('/conversations/$id');
      return Conversation.fromJson(response.data['data'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw Exception(e.response?.data['message'] ?? 'Failed to fetch conversation');
    }
  }

  Future<Conversation> startConversation({required String recipientId, String? message}) async {
    try {
      final response = await apiClient.dio.post('/conversations', data: {
        'recipientId': recipientId,
        if (message != null) 'message': message,
      });
      return Conversation.fromJson(response.data['data'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw Exception(e.response?.data['message'] ?? 'Failed to start conversation');
    }
  }

  Future<List<Message>> getMessages(String conversationId, {int page = 1, int limit = 15}) async {
    try {
      final response = await apiClient.dio.get('/conversations/$conversationId/messages', queryParameters: {
        'page': page,
        'limit': limit,
      });
      final List items = response.data['items'] ?? [];
      return items.map((x) => Message.fromJson(x as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw Exception(e.response?.data['message'] ?? 'Failed to load messages');
    }
  }

  Future<Message> sendMessage(
    String conversationId, {
    required String body,
    String? mediaId,
    String? replyToId,
  }) async {
    try {
      final response = await apiClient.dio.post('/conversations/$conversationId/messages', data: {
        'body': body,
        if (mediaId != null) 'mediaId': mediaId,
        if (replyToId != null) 'replyToId': replyToId,
      });
      return Message.fromJson(response.data['data'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw Exception(e.response?.data['message'] ?? 'Failed to send message');
    }
  }

  Future<void> markAsRead(String conversationId) async {
    try {
      await apiClient.dio.post('/conversations/$conversationId/read');
    } on DioException catch (_) {
      // Silent error
    }
  }

  void dispose() {
    _messageController.close();
    _readController.close();
    _socket?.disconnect();
  }
}
