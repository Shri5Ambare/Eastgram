import 'package:flutter/material.dart';
import '../models/models.dart';
import '../services/post_service.dart';

class FeedProvider extends ChangeNotifier {
  final PostService postService;

  List<Post> _feedPosts = [];
  List<Post> _stories = [];
  bool _isLoadingFeed = false;
  bool _isLoadingStories = false;
  int _currentPage = 1;
  bool _hasMore = true;
  String? _error;

  List<Post> get feedPosts => _feedPosts;
  List<Post> get stories => _stories;
  bool get isLoadingFeed => _isLoadingFeed;
  bool get isLoadingStories => _isLoadingStories;
  bool get hasMore => _hasMore;
  String? get error => _error;

  FeedProvider({required this.postService});

  Future<void> fetchFeed({bool refresh = false}) async {
    if (refresh) {
      _currentPage = 1;
      _hasMore = true;
      _feedPosts = [];
    }

    if (!_hasMore || _isLoadingFeed) return;

    _isLoadingFeed = true;
    _error = null;
    notifyListeners();

    try {
      final posts = await postService.getFeed(page: _currentPage, limit: 10);
      if (posts.length < 10) {
        _hasMore = false;
      }
      _feedPosts.addAll(posts);
      _currentPage++;
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoadingFeed = false;
      notifyListeners();
    }
  }

  Future<void> fetchStories() async {
    if (_isLoadingStories) return;

    _isLoadingStories = true;
    notifyListeners();

    try {
      _stories = await postService.getStories();
    } catch (_) {
      // Ignore failures
    } finally {
      _isLoadingStories = false;
      notifyListeners();
    }
  }

  Future<bool> createPost({
    required String caption,
    required String type,
    required String visibility,
    List<String>? mediaIds,
    String? groupId,
  }) async {
    _isLoadingFeed = true;
    notifyListeners();

    try {
      final post = await postService.createPost(
        caption: caption,
        type: type,
        visibility: visibility,
        mediaIds: mediaIds,
        groupId: groupId,
      );
      // Insert to top of feed
      _feedPosts.insert(0, post);
      _isLoadingFeed = false;
      notifyListeners();
      return true;
    } catch (e) {
      _isLoadingFeed = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> toggleReaction(String postId, String type) async {
    final index = _feedPosts.indexWhere((p) => p.id == postId);
    if (index == -1) return;

    final post = _feedPosts[index];
    
    try {
      final data = await postService.reactToPost(postId: postId, reactionType: type);
      final newLikeCount = data['likeCount'] as int? ?? post.likeCount;

      _feedPosts[index] = Post(
        id: post.id,
        authorId: post.authorId,
        author: post.author,
        type: post.type,
        visibility: post.visibility,
        caption: post.caption,
        expiresAt: post.expiresAt,
        likeCount: newLikeCount,
        commentCount: post.commentCount,
        viewCount: post.viewCount,
        isPinned: post.isPinned,
        createdAt: post.createdAt,
        media: post.media,
      );
      notifyListeners();
    } catch (_) {
      // Rollback or ignore
    }
  }
}
