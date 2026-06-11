class User {
  final String id;
  final String schoolId;
  final String? classId;
  final String email;
  final String username;
  final String fullName;
  final String role;
  final String status;
  final String? avatarUrl;
  final String? bio;
  final String messagePermission;
  final bool isVerified;
  final bool isPrivate;

  User({
    required this.id,
    required this.schoolId,
    this.classId,
    required this.email,
    required this.username,
    required this.fullName,
    required this.role,
    required this.status,
    this.avatarUrl,
    this.bio,
    required this.messagePermission,
    required this.isVerified,
    required this.isPrivate,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] as String,
      schoolId: json['schoolId'] as String,
      classId: json['classId'] as String?,
      email: json['email'] as String,
      username: json['username'] as String,
      fullName: json['fullName'] as String,
      role: json['role'] as String,
      status: json['status'] as String,
      avatarUrl: json['avatarUrl'] as String?,
      bio: json['bio'] as String?,
      messagePermission: json['messagePermission'] as String? ?? 'REPLY_ONLY',
      isVerified: json['isVerified'] as bool? ?? false,
      isPrivate: json['isPrivate'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'schoolId': schoolId,
      'classId': classId,
      'email': email,
      'username': username,
      'fullName': fullName,
      'role': role,
      'status': status,
      'avatarUrl': avatarUrl,
      'bio': bio,
      'messagePermission': messagePermission,
      'isVerified': isVerified,
      'isPrivate': isPrivate,
    };
  }
}
