import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../providers/auth_provider.dart';
import '../../../providers/chat_provider.dart';
import '../../../models/models.dart';

class ChatRoomScreen extends StatefulWidget {
  final Conversation conversation;

  const ChatRoomScreen({super.key, required this.conversation});

  @override
  State<ChatRoomScreen> createState() => _ChatRoomScreenState();
}

class _ChatRoomScreenState extends State<ChatRoomScreen> {
  final _textController = TextEditingController();
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final chat = Provider.of<ChatProvider>(context, listen: false);
      chat.setActiveConversation(widget.conversation.id);
      chat.fetchMessages(widget.conversation.id);
    });
  }

  @override
  void dispose() {
    // Clear active conversation on exit synchronously
    Provider.of<ChatProvider>(context, listen: false).setActiveConversation(null);
    _textController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _sendMessage() async {
    final body = _textController.text.trim();
    if (body.isEmpty) return;

    _textController.clear();
    try {
      await Provider.of<ChatProvider>(context, listen: false).sendMessage(
        widget.conversation.id,
        body,
      );
      // Scroll to bottom (since items are reversed, index 0 is at bottom)
      _scrollController.animateTo(
        0.0,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to send message: $e'), backgroundColor: Colors.redAccent),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final messages = context.select<ChatProvider, List<Message>>(
      (provider) => provider.getActiveMessages(widget.conversation.id),
    );
    final isLoading = context.select<ChatProvider, bool>(
      (provider) => provider.isMessagesLoading(widget.conversation.id),
    );
    final currentUserId = context.select<AuthProvider, String?>(
      (provider) => provider.currentUser?.id,
    );

    // Find other participant
    final otherMember = widget.conversation.members.firstWhere(
      (m) => m.userId != currentUserId,
      orElse: () => widget.conversation.members.first,
    );
    final displayName = widget.conversation.type == 'DIRECT'
        ? (otherMember.user?.fullName ?? 'Direct Chat')
        : (widget.conversation.title ?? 'Group Chat');

    return Scaffold(
      appBar: AppBar(
        title: Text(displayName, style: const TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.white,
        foregroundColor: Colors.black87,
        elevation: 0.5,
      ),
      body: Column(
        children: [
          Expanded(
            child: isLoading && messages.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : messages.isEmpty
                    ? const Center(child: Text('Start of conversation'))
                    : ListView.builder(
                        controller: _scrollController,
                        reverse: true, // Show newest messages at bottom
                        padding: const EdgeInsets.all(16.0),
                        itemCount: messages.length,
                        itemBuilder: (ctx, idx) {
                          final msg = messages[idx];
                          final isMe = msg.senderId == currentUserId;
                          return _MessageBubble(message: msg, isMe: isMe);
                        },
                      ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 8.0),
            decoration: BoxDecoration(
              color: Colors.white,
              boxShadow: [
                BoxShadow(
                  color: Colors.grey.withOpacity(0.1),
                  spreadRadius: 1,
                  blurRadius: 5,
                  offset: const Offset(0, -1),
                ),
              ],
            ),
            child: SafeArea(
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _textController,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: InputDecoration(
                        hintText: 'Type your message...',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24.0),
                          borderSide: BorderSide.none,
                        ),
                        filled: true,
                        fillColor: Colors.grey[100],
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      ),
                      onSubmitted: (_) => _sendMessage(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  GestureDetector(
                    onTap: _sendMessage,
                    child: CircleAvatar(
                      radius: 22,
                      backgroundColor: const Color(0xFF764BA2),
                      child: const Icon(Icons.send, color: Colors.white, size: 20),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  final Message message;
  final bool isMe;

  const _MessageBubble({required this.message, required this.isMe});

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4.0),
        padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 10.0),
        decoration: BoxDecoration(
          color: isMe ? const Color(0xFF764BA2) : Colors.grey[200],
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16.0),
            topRight: const Radius.circular(16.0),
            bottomLeft: isMe ? const Radius.circular(16.0) : Radius.zero,
            bottomRight: isMe ? Radius.zero : const Radius.circular(16.0),
          ),
        ),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.75,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!isMe && message.sender != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 4.0),
                child: Text(
                  message.sender!.fullName,
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Colors.black54),
                ),
              ),
            Text(
              message.body ?? '',
              style: TextStyle(
                color: isMe ? Colors.white : Colors.black87,
                fontSize: 14.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
