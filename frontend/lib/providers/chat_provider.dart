import 'dart:async';
import 'package:flutter/material.dart';
import '../models/models.dart';
import '../services/chat_service.dart';

class ChatProvider extends ChangeNotifier {
  final ChatService chatService;

  List<Conversation> _conversations = [];
  final Map<String, List<Message>> _messages = {};
  bool _isLoadingConversations = false;
  final Map<String, bool> _isLoadingMessages = {};

  String? _activeConversationId;
  StreamSubscription<Message>? _messageSubscription;

  List<Conversation> get conversations => _conversations;
  List<Message> getActiveMessages(String convId) => _messages[convId] ?? [];
  bool get isLoadingConversations => _isLoadingConversations;
  bool isMessagesLoading(String convId) => _isLoadingMessages[convId] ?? false;
  String? get activeConversationId => _activeConversationId;

  ChatProvider({required this.chatService}) {
    _messageSubscription = chatService.messageStream.listen(_onNewMessageReceived);
  }

  void setActiveConversation(String? id) {
    _activeConversationId = id;
    if (id != null) {
      chatService.markAsRead(id);
    }
  }

  Future<void> fetchConversations() async {
    _isLoadingConversations = true;
    notifyListeners();

    try {
      _conversations = await chatService.getConversations();
    } catch (_) {
      // Handle errors
    } finally {
      _isLoadingConversations = false;
      notifyListeners();
    }
  }

  Future<void> fetchMessages(String conversationId) async {
    if (_isLoadingMessages[conversationId] == true) return;

    _isLoadingMessages[conversationId] = true;
    notifyListeners();

    try {
      final list = await chatService.getMessages(conversationId);
      _messages[conversationId] = list;
    } catch (_) {
      // Handle errors
    } finally {
      _isLoadingMessages[conversationId] = false;
      notifyListeners();
    }
  }

  Future<void> sendMessage(String conversationId, String body) async {
    try {
      final msg = await chatService.sendMessage(conversationId, body: body);
      
      if (_messages[conversationId] == null) {
        _messages[conversationId] = [];
      }
      _messages[conversationId]!.insert(0, msg);

      // Move conversation to top with new lastMessage
      final idx = _conversations.indexWhere((c) => c.id == conversationId);
      if (idx != -1) {
        final currentConv = _conversations[idx];
        final updatedConv = Conversation(
          id: currentConv.id,
          type: currentConv.type,
          title: currentConv.title,
          groupId: currentConv.groupId,
          createdAt: currentConv.createdAt,
          members: currentConv.members,
          lastMessage: msg,
        );
        _conversations.removeAt(idx);
        _conversations.insert(0, updatedConv);
      }
      notifyListeners();
    } catch (_) {
      rethrow;
    }
  }

  Future<Conversation> startNewConversation(String recipientId, String message) async {
    try {
      final conv = await chatService.startConversation(recipientId: recipientId, message: message);
      await fetchConversations();
      return conv;
    } catch (e) {
      throw Exception(e.toString());
    }
  }

  void _onNewMessageReceived(Message msg) {
    final convId = msg.conversationId;
    if (_messages[convId] == null) {
      _messages[convId] = [];
    }
    
    // Avoid duplicates
    if (!_messages[convId]!.any((m) => m.id == msg.id)) {
      _messages[convId]!.insert(0, msg);
    }

    if (_activeConversationId == convId) {
      chatService.markAsRead(convId);
    }

    final idx = _conversations.indexWhere((c) => c.id == convId);
    if (idx != -1) {
      final currentConv = _conversations[idx];
      final updatedConv = Conversation(
        id: currentConv.id,
        type: currentConv.type,
        title: currentConv.title,
        groupId: currentConv.groupId,
        createdAt: currentConv.createdAt,
        members: currentConv.members,
        lastMessage: msg,
      );
      _conversations.removeAt(idx);
      _conversations.insert(0, updatedConv);
    } else {
      fetchConversations();
    }
    notifyListeners();
  }

  @override
  void dispose() {
    _messageSubscription?.cancel();
    super.dispose();
  }
}
