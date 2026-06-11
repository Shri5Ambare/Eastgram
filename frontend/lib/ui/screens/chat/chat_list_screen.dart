import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../../providers/auth_provider.dart';
import '../../../providers/chat_provider.dart';
import '../../../models/models.dart';
import 'chat_room_screen.dart';

class ChatListScreen extends StatefulWidget {
  const ChatListScreen({super.key});

  @override
  State<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends State<ChatListScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Provider.of<ChatProvider>(context, listen: false).fetchConversations();
    });
  }

  void _showStartChatDialog() {
    final searchController = TextEditingController();
    final messageController = TextEditingController();
    
    // We can list users. Let's make a mock list first or input target username/id
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Start New DM'),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: searchController,
              decoration: const InputDecoration(
                hintText: 'Enter recipient user ID',
                labelText: 'Recipient ID',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: messageController,
              decoration: const InputDecoration(
                hintText: 'Say hello!',
                labelText: 'Message (Optional)',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF764BA2),
              foregroundColor: Colors.white,
            ),
            onPressed: () async {
              final recipientId = searchController.text.trim();
              if (recipientId.isNotEmpty) {
                try {
                  final provider = Provider.of<ChatProvider>(context, listen: false);
                  final conv = await provider.startNewConversation(
                    recipientId,
                    messageController.text.trim().isNotEmpty ? messageController.text.trim() : 'Hello!',
                  );
                  if (mounted) {
                    Navigator.pop(ctx);
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) => ChatRoomScreen(conversation: conv),
                      ),
                    );
                  }
                } catch (e) {
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(e.toString()), backgroundColor: Colors.redAccent),
                    );
                  }
                }
              }
            },
            child: const Text('Start'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final chat = Provider.of<ChatProvider>(context);
    final currentUserId = Provider.of<AuthProvider>(context).currentUser?.id;

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Messages',
          style: TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF764BA2)),
        ),
        backgroundColor: Colors.white,
        elevation: 0.5,
      ),
      body: chat.isLoadingConversations
          ? const Center(child: CircularProgressIndicator())
          : chat.conversations.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.chat_bubble_outline, size: 64, color: Colors.grey),
                      const SizedBox(height: 16),
                      const Text(
                        'No messages yet',
                        style: TextStyle(fontSize: 18, color: Colors.grey),
                      ),
                      const SizedBox(height: 8),
                      ElevatedButton(
                        onPressed: _showStartChatDialog,
                        child: const Text('Start Conversation'),
                      ),
                    ],
                  ),
                )
              : ListView.separated(
                  itemCount: chat.conversations.length,
                  separatorBuilder: (ctx, idx) => const Divider(height: 1),
                  itemBuilder: (ctx, idx) {
                    final conv = chat.conversations[idx];

                    // Find other participant user details
                    final otherMember = conv.members.firstWhere(
                      (m) => m.userId != currentUserId,
                      orElse: () => conv.members.first,
                    );
                    final otherUser = otherMember.user;
                    final displayName = conv.type == 'DIRECT'
                        ? (otherUser?.fullName ?? 'Direct Chat')
                        : (conv.title ?? 'Group Chat');

                    return ListTile(
                      leading: CircleAvatar(
                        backgroundImage: otherUser?.avatarUrl != null ? CachedNetworkImageProvider(otherUser!.avatarUrl!) : null,
                        child: otherUser?.avatarUrl == null ? const Icon(Icons.person) : null,
                      ),
                      title: Text(
                        displayName,
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      subtitle: Text(
                        conv.lastMessage?.body ?? 'No messages yet',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      trailing: Text(
                        conv.lastMessage != null
                            ? _formatTime(conv.lastMessage!.createdAt)
                            : '',
                        style: const TextStyle(color: Colors.grey, fontSize: 12),
                      ),
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) => ChatRoomScreen(conversation: conv),
                          ),
                        );
                      },
                    );
                  },
                ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showStartChatDialog,
        backgroundColor: const Color(0xFF764BA2),
        foregroundColor: Colors.white,
        child: const Icon(Icons.message),
      ),
    );
  }

  String _formatTime(DateTime dt) {
    return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }
}
