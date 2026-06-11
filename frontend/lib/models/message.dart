import 'user.dart';

class Conversation {
  final String id;
  final String type; // DIRECT | GROUP
  final String? title;
  final String? groupId;
  final DateTime createdAt;
  final List<ConversationMember> members;
  final Message? lastMessage; // optional field populated for list view

  Conversation({
    required this.id,
    required this.type,
    this.title,
    this.groupId,
    required this.createdAt,
    required this.members,
    this.lastMessage,
  });

  factory Conversation.fromJson(Map<String, dynamic> json) {
    var membersList = <ConversationMember>[];
    if (json['members'] != null) {
      membersList = (json['members'] as List)
          .map((m) => ConversationMember.fromJson(m as Map<String, dynamic>))
          .toList();
    }
    return Conversation(
      id: json['id'] as String,
      type: json['type'] as String? ?? 'DIRECT',
      title: json['title'] as String?,
      groupId: json['groupId'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      members: membersList,
      lastMessage: json['lastMessage'] != null ? Message.fromJson(json['lastMessage']) : null,
    );
  }
}

class ConversationMember {
  final String id;
  final String conversationId;
  final String userId;
  final User? user;
  final bool isAdmin;
  final DateTime? lastReadAt;
  final DateTime joinedAt;

  ConversationMember({
    required this.id,
    required this.conversationId,
    required this.userId,
    this.user,
    required this.isAdmin,
    this.lastReadAt,
    required this.joinedAt,
  });

  factory ConversationMember.fromJson(Map<String, dynamic> json) {
    return ConversationMember(
      id: json['id'] as String,
      conversationId: json['conversationId'] as String,
      userId: json['userId'] as String,
      user: json['user'] != null ? User.fromJson(json['user']) : null,
      isAdmin: json['isAdmin'] as bool? ?? false,
      lastReadAt: json['lastReadAt'] != null ? DateTime.parse(json['lastReadAt'] as String) : null,
      joinedAt: DateTime.parse(json['joinedAt'] as String),
    );
  }
}

class Message {
  final String id;
  final String conversationId;
  final String senderId;
  final User? sender;
  final String? body;
  final String? mediaId;
  final String? replyToId;
  final bool isDeleted;
  final DateTime createdAt;

  Message({
    required this.id,
    required this.conversationId,
    required this.senderId,
    this.sender,
    this.body,
    this.mediaId,
    this.replyToId,
    required this.isDeleted,
    required this.createdAt,
  });

  factory Message.fromJson(Map<String, dynamic> json) {
    return Message(
      id: json['id'] as String,
      conversationId: json['conversationId'] as String,
      senderId: json['senderId'] as String,
      sender: json['sender'] != null ? User.fromJson(json['sender']) : null,
      body: json['body'] as String?,
      mediaId: json['mediaId'] as String?,
      replyToId: json['replyToId'] as String?,
      isDeleted: json['isDeleted'] as bool? ?? false,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}
