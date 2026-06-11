import 'user.dart';

class PollOption {
  final String id;
  final String pollId;
  final String label;
  final int position;
  final int voteCount;

  PollOption({
    required this.id,
    required this.pollId,
    required this.label,
    required this.position,
    required this.voteCount,
  });

  factory PollOption.fromJson(Map<String, dynamic> json) {
    return PollOption(
      id: json['id'] as String,
      pollId: json['pollId'] as String,
      label: json['label'] as String,
      position: json['position'] as int? ?? 0,
      voteCount: json['voteCount'] as int? ?? 0,
    );
  }
}

class PollCandidate {
  final String id;
  final String pollId;
  final String? userId;
  final String displayName;
  final String? category;
  final String? photoUrl;
  final String? manifesto;
  final int voteCount;

  PollCandidate({
    required this.id,
    required this.pollId,
    this.userId,
    required this.displayName,
    this.category,
    this.photoUrl,
    this.manifesto,
    required this.voteCount,
  });

  factory PollCandidate.fromJson(Map<String, dynamic> json) {
    return PollCandidate(
      id: json['id'] as String,
      pollId: json['pollId'] as String,
      userId: json['userId'] as String?,
      displayName: json['displayName'] as String,
      category: json['category'] as String?,
      photoUrl: json['photoUrl'] as String?,
      manifesto: json['manifesto'] as String?,
      voteCount: json['voteCount'] as int? ?? 0,
    );
  }
}

class Poll {
  final String id;
  final String creatorId;
  final User? creator;
  final String type; // QUICK | ELECTION | PAGEANT
  final String status; // DRAFT | SCHEDULED | OPEN | CLOSED | ARCHIVED
  final String question;
  final String? description;
  final bool allowMultiple;
  final int maxSelections;
  final bool isAnonymous;
  final String? groupId;
  final String? postId;
  final DateTime? opensAt;
  final DateTime? closesAt;
  final List<PollOption> options;
  final List<PollCandidate> candidates;
  final List<Map<String, dynamic>> myVotes; // List of user's votes in this poll

  Poll({
    required this.id,
    required this.creatorId,
    this.creator,
    required this.type,
    required this.status,
    required this.question,
    this.description,
    required this.allowMultiple,
    required this.maxSelections,
    required this.isAnonymous,
    this.groupId,
    this.postId,
    this.opensAt,
    this.closesAt,
    required this.options,
    required this.candidates,
    required this.myVotes,
  });

  factory Poll.fromJson(Map<String, dynamic> json) {
    var optionsList = <PollOption>[];
    if (json['options'] != null) {
      optionsList = (json['options'] as List)
          .map((o) => PollOption.fromJson(o as Map<String, dynamic>))
          .toList();
    }

    var candidatesList = <PollCandidate>[];
    if (json['candidates'] != null) {
      candidatesList = (json['candidates'] as List)
          .map((c) => PollCandidate.fromJson(c as Map<String, dynamic>))
          .toList();
    }

    var myVotesList = <Map<String, dynamic>>[];
    if (json['myVotes'] != null) {
      myVotesList = List<Map<String, dynamic>>.from(json['myVotes']);
    }

    return Poll(
      id: json['id'] as String,
      creatorId: json['creatorId'] as String,
      creator: json['creator'] != null ? User.fromJson(json['creator']) : null,
      type: json['type'] as String? ?? 'QUICK',
      status: json['status'] as String? ?? 'DRAFT',
      question: json['question'] as String,
      description: json['description'] as String?,
      allowMultiple: json['allowMultiple'] as bool? ?? false,
      maxSelections: json['maxSelections'] as int? ?? 1,
      isAnonymous: json['isAnonymous'] as bool? ?? true,
      groupId: json['groupId'] as String?,
      postId: json['postId'] as String?,
      opensAt: json['opensAt'] != null ? DateTime.parse(json['opensAt'] as String) : null,
      closesAt: json['closesAt'] != null ? DateTime.parse(json['closesAt'] as String) : null,
      options: optionsList,
      candidates: candidatesList,
      myVotes: myVotesList,
    );
  }
}
