import 'package:dio/dio.dart';
import '../core/api_client.dart';
import '../models/models.dart';

class PostService {
  final ApiClient apiClient;

  PostService({required this.apiClient});

  Future<List<Post>> getFeed({int page = 1, int limit = 10}) async {
    try {
      final response = await apiClient.dio.get('/feed', queryParameters: {
        'page': page,
        'limit': limit,
      });
      final List items = response.data['items'] ?? [];
      return items.map((x) => Post.fromJson(x as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw Exception(e.response?.data['message'] ?? 'Failed to load feed');
    }
  }

  Future<List<Post>> getReels({int page = 1, int limit = 10}) async {
    try {
      final response = await apiClient.dio.get('/reels', queryParameters: {
        'page': page,
        'limit': limit,
      });
      final List items = response.data['items'] ?? [];
      return items.map((x) => Post.fromJson(x as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw Exception(e.response?.data['message'] ?? 'Failed to load reels');
    }
  }

  Future<List<Post>> getStories() async {
    try {
      final response = await apiClient.dio.get('/stories');
      final List items = response.data['data'] ?? [];
      return items.map((x) => Post.fromJson(x as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw Exception(e.response?.data['message'] ?? 'Failed to load stories');
    }
  }

  Future<Post> createPost({
    required String caption,
    required String type, // POST | REEL | STORY | ACHIEVEMENT
    required String visibility, // SCHOOL | CLASS | CLUB | PRIVATE
    List<String>? mediaIds,
    String? groupId,
  }) async {
    try {
      final response = await apiClient.dio.post('/posts', data: {
        'caption': caption,
        'type': type,
        'visibility': visibility,
        if (mediaIds != null) 'mediaIds': mediaIds,
        if (groupId != null) 'groupId': groupId,
      });
      return Post.fromJson(response.data['data'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw Exception(e.response?.data['message'] ?? 'Failed to create post');
    }
  }

  Future<Map<String, dynamic>> reactToPost({required String postId, required String reactionType}) async {
    try {
      final response = await apiClient.dio.post('/posts/$postId/react', data: {
        'type': reactionType, // LIKE, LOVE, CELEBRATE, SUPPORT, INSIGHTFUL
      });
      return response.data['data'] as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception(e.response?.data['message'] ?? 'Failed to react to post');
    }
  }

  Future<List<Comment>> getComments({required String postId, int page = 1, int limit = 10}) async {
    try {
      final response = await apiClient.dio.get('/posts/$postId/comments', queryParameters: {
        'page': page,
        'limit': limit,
      });
      final List items = response.data['items'] ?? [];
      return items.map((x) => Comment.fromJson(x as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw Exception(e.response?.data['message'] ?? 'Failed to load comments');
    }
  }

  Future<Comment> addComment({required String postId, required String body, String? parentId}) async {
    try {
      final response = await apiClient.dio.post('/posts/$postId/comments', data: {
        'body': body,
        if (parentId != null) 'parentId': parentId,
      });
      return Comment.fromJson(response.data['data'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw Exception(e.response?.data['message'] ?? 'Failed to add comment');
    }
  }
}
