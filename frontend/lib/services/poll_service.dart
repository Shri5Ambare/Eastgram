import 'package:dio/dio.dart';
import '../core/api_client.dart';
import '../models/models.dart';

class PollService {
  final ApiClient apiClient;

  PollService({required this.apiClient});

  Future<Poll> createPoll({
    required String question,
    String? description,
    required String type, // QUICK | ELECTION | PAGEANT
    bool allowMultiple = false,
    int maxSelections = 1,
    bool isAnonymous = true,
    String? groupId,
    String? opensAt,
    String? closesAt,
    List<String>? options, // for QUICK
    List<Map<String, dynamic>>? candidates, // for ELECTION/PAGEANT
  }) async {
    try {
      final response = await apiClient.dio.post('/polls', data: {
        'question': question,
        if (description != null) 'description': description,
        'type': type,
        'allowMultiple': allowMultiple,
        'maxSelections': maxSelections,
        'isAnonymous': isAnonymous,
        if (groupId != null) 'groupId': groupId,
        if (opensAt != null) 'opensAt': opensAt,
        if (closesAt != null) 'closesAt': closesAt,
        if (options != null) 'options': options.map((label) => {'label': label}).toList(),
        if (candidates != null) 'candidates': candidates,
      });
      return Poll.fromJson(response.data['data'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw Exception(e.response?.data['message'] ?? 'Failed to create poll');
    }
  }

  Future<List<Poll>> listPolls({int page = 1, int limit = 10}) async {
    try {
      final response = await apiClient.dio.get('/polls', queryParameters: {
        'page': page,
        'limit': limit,
      });
      final List items = response.data['items'] ?? [];
      return items.map((x) => Poll.fromJson(x as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw Exception(e.response?.data['message'] ?? 'Failed to load polls');
    }
  }

  Future<Poll> getPoll(String id) async {
    try {
      final response = await apiClient.dio.get('/polls/$id');
      return Poll.fromJson(response.data['data'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw Exception(e.response?.data['message'] ?? 'Failed to fetch poll');
    }
  }

  Future<void> vote(
    String pollId, {
    String? optionId,
    String? candidateId,
    String? category,
  }) async {
    try {
      await apiClient.dio.post('/polls/$pollId/vote', data: {
        if (optionId != null) 'optionId': optionId,
        if (candidateId != null) 'candidateId': candidateId,
        if (category != null) 'category': category,
      });
    } on DioException catch (e) {
      throw Exception(e.response?.data['message'] ?? 'Failed to submit vote');
    }
  }

  Future<Map<String, dynamic>> getResults(String id) async {
    try {
      final response = await apiClient.dio.get('/polls/$id/results');
      return response.data['data'] as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception(e.response?.data['message'] ?? 'Failed to load poll results');
    }
  }
}
