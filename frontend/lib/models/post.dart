import 'user.dart';

class PostMedia {
  final String id;
  final String mediaId;
  final String url;
  final String type; // IMAGE | VIDEO etc
  final String? thumbnailUrl;

  PostMedia({
    required this.id,
    required this.mediaId,
    required this.url,
    required this.type,
    this.thumbnailUrl,
  });

  factory PostMedia.fromJson(Map<String, dynamic> json) {
    // Check nested media object from backend joins
    final media = json['media'] as Map<String, dynamic>?;
    return PostMedia(
      id: json['id'] as String,
      mediaId: json['mediaId'] as String,
      url: media != null ? media['url'] as String : (json['url'] as String? ?? ''),
      type: media != null ? media['type'] as String : (json['type'] as String? ?? 'IMAGE'),
      thumbnailUrl: media != null ? media['thumbnailUrl'] as String? : json['thumbnailUrl'] as String?,
    );
  }
}

class Comment {
  final String id;
  final String postId;
  final String authorId;
  final User? author;
  final String body;
  final String? parentId;
  final int likeCount;
  final DateTime createdAt;

  Comment({
    required this.id,
    required this.postId,
    required this.authorId,
    this.author,
    required this.body,
    this.parentId,
    required this.likeCount,
    required this.createdAt,
  });

  factory Comment.fromJson(Map<String, dynamic> json) {
    return Comment(
      id: json['id'] as String,
      postId: json['postId'] as String,
      authorId: json['authorId'] as String,
      author: json['author'] != null ? User.fromJson(json['author']) : null,
      body: json['body'] as String,
      parentId: json['parentId'] as String?,
      likeCount: json['likeCount'] as int? ?? 0,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}

class Post {
  final String id;
  final String authorId;
  final User? author;
  final String type; // POST | REEL | STORY | ACHIEVEMENT
  final String visibility; // SCHOOL | CLASS | CLUB | PRIVATE
  final String? caption;
  final DateTime? expiresAt;
  final int likeCount;
  final int commentCount;
  final int viewCount;
  final bool isPinned;
  final DateTime createdAt;
  final List<PostMedia> media;

  Post({
    required this.id,
    required this.authorId,
    this.author,
    required this.type,
    required this.visibility,
    this.caption,
    this.expiresAt,
    required this.likeCount,
    required this.commentCount,
    required this.viewCount,
    required this.isPinned,
    required this.createdAt,
    required this.media,
  });

  factory Post.fromJson(Map<String, dynamic> json) {
    var mediaList = <PostMedia>[];
    if (json['media'] != null) {
      mediaList = (json['media'] as List)
          .map((m) => PostMedia.fromJson(m as Map<String, dynamic>))
          .toList();
    }
    return Post(
      id: json['id'] as String,
      authorId: json['authorId'] as String,
      author: json['author'] != null ? User.fromJson(json['author']) : null,
      type: json['type'] as String? ?? 'POST',
      visibility: json['visibility'] as String? ?? 'SCHOOL',
      caption: json['caption'] as String?,
      expiresAt: json['expiresAt'] != null ? DateTime.parse(json['expiresAt'] as String) : null,
      likeCount: json['likeCount'] as int? ?? 0,
      commentCount: json['commentCount'] as int? ?? 0,
      viewCount: json['viewCount'] as int? ?? 0,
      isPinned: json['isPinned'] as bool? ?? false,
      createdAt: DateTime.parse(json['createdAt'] as String),
      media: mediaList,
    );
  }
}
