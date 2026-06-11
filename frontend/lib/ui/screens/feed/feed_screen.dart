import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../../providers/auth_provider.dart';
import '../../../providers/feed_provider.dart';
import '../../../models/models.dart';

class FeedScreen extends StatefulWidget {
  const FeedScreen({super.key});

  @override
  State<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends State<FeedScreen> {
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final feed = Provider.of<FeedProvider>(context, listen: false);
      feed.fetchFeed(refresh: true);
      feed.fetchStories();
    });

    _scrollController.addListener(() {
      if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200) {
        Provider.of<FeedProvider>(context, listen: false).fetchFeed();
      }
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _showCreatePostDialog() {
    final textController = TextEditingController();
    String visibility = 'SCHOOL';

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Create New Post'),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: textController,
              maxLines: 4,
              decoration: const InputDecoration(
                hintText: 'What is happening in your school?',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              value: visibility,
              decoration: const InputDecoration(labelText: 'Visibility'),
              items: const [
                DropdownMenuItem(value: 'SCHOOL', child: Text('School (Everyone)')),
                DropdownMenuItem(value: 'CLASS', child: Text('My Class Only')),
                DropdownMenuItem(value: 'PRIVATE', child: Text('Private')),
              ],
              onChanged: (val) {
                if (val != null) visibility = val;
              },
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
              if (textController.text.trim().isNotEmpty) {
                final success = await Provider.of<FeedProvider>(context, listen: false).createPost(
                  caption: textController.text.trim(),
                  type: 'POST',
                  visibility: visibility,
                );
                if (success && mounted) {
                  Navigator.pop(ctx);
                }
              }
            },
            child: const Text('Post'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final feed = Provider.of<FeedProvider>(context);
    final user = Provider.of<AuthProvider>(context).currentUser;

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'EduGram',
          style: TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF764BA2)),
        ),
        backgroundColor: Colors.white,
        elevation: 0.5,
        actions: [
          IconButton(
            icon: const Icon(Icons.add_box_outlined, color: Colors.black87),
            onPressed: _showCreatePostDialog,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await feed.fetchFeed(refresh: true);
          await feed.fetchStories();
        },
        child: CustomScrollView(
          controller: _scrollController,
          slivers: [
            // Stories Section
            SliverToBoxAdapter(
              child: feed.stories.isEmpty && feed.isLoadingStories
                  ? const SizedBox(
                      height: 100,
                      child: Center(child: CircularProgressIndicator()),
                    )
                  : feed.stories.isEmpty
                      ? const SizedBox.shrink()
                      : Container(
                          height: 110,
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          decoration: const BoxDecoration(
                            border: Border(bottom: BorderSide(color: Colors.black12, width: 0.5)),
                          ),
                          child: ListView.builder(
                            scrollDirection: Axis.horizontal,
                            itemCount: feed.stories.length,
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            itemBuilder: (ctx, idx) {
                              final story = feed.stories[idx];
                              return Padding(
                                padding: const EdgeInsets.only(right: 16.0),
                                child: Column(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.all(2.5),
                                      decoration: const BoxDecoration(
                                        shape: BoxShape.circle,
                                        gradient: LinearGradient(
                                          colors: [Colors.pink, Colors.orangeAccent],
                                        ),
                                      ),
                                      child: CircleAvatar(
                                        radius: 30,
                                        backgroundImage: story.author?.avatarUrl != null
                                            ? CachedNetworkImageProvider(story.author!.avatarUrl!)
                                            : null,
                                        child: story.author?.avatarUrl == null
                                            ? const Icon(Icons.person, color: Colors.white, size: 30)
                                            : null,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      story.author?.username ?? '',
                                      style: const TextStyle(fontSize: 11),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ],
                                ),
                              );
                            },
                          ),
                        ),
            ),
            // Feed Posts List
            if (feed.feedPosts.isEmpty && feed.isLoadingFeed)
              const SliverFillRemaining(
                child: Center(child: CircularProgressIndicator()),
              )
            else if (feed.feedPosts.isEmpty)
              const SliverFillRemaining(
                child: Center(child: Text('No posts yet! Be the first to post.')),
              )
            else
              SliverList(
                delegate: SliverChildBuilderDelegate(
                  (ctx, idx) {
                    if (idx == feed.feedPosts.length) {
                      return const Padding(
                        padding: EdgeInsets.all(16.0),
                        child: Center(child: CircularProgressIndicator()),
                      );
                    }
                    final post = feed.feedPosts[idx];
                    return _PostCard(post: post);
                  },
                  childCount: feed.feedPosts.length + (feed.hasMore ? 1 : 0),
                ),
              ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showCreatePostDialog,
        backgroundColor: const Color(0xFF764BA2),
        foregroundColor: Colors.white,
        child: const Icon(Icons.edit),
      ),
    );
  }
}

class _PostCard extends StatelessWidget {
  final Post post;

  const _PostCard({required this.post});

  @override
  Widget build(BuildContext context) {
    final feed = Provider.of<FeedProvider>(context, listen: false);

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      elevation: 2,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          ListTile(
            leading: CircleAvatar(
              backgroundImage: post.author?.avatarUrl != null ? CachedNetworkImageProvider(post.author!.avatarUrl!) : null,
              child: post.author?.avatarUrl == null ? const Icon(Icons.person) : null,
            ),
            title: Text(
              post.author?.fullName ?? 'Anonymous',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            subtitle: Text('@${post.author?.username ?? ''} · ${post.visibility}'),
            trailing: post.isPinned ? const Icon(Icons.push_pin, color: Colors.blueAccent) : null,
          ),

          // Caption
          if (post.caption != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
              child: Text(
                post.caption!,
                style: const TextStyle(fontSize: 15),
              ),
            ),

          // Media (Placeholder or static if image is present)
          if (post.media.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8.0),
              child: Container(
                height: 250,
                width: double.infinity,
                decoration: BoxDecoration(
                  color: Colors.grey[200],
                  image: DecorationImage(
                    image: CachedNetworkImageProvider(post.media.first.url),
                    fit: BoxFit.cover,
                  ),
                ),
              ),
            ),

          // Action buttons
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
            child: Row(
              children: [
                IconButton(
                  icon: const Icon(Icons.favorite_border),
                  onPressed: () => feed.toggleReaction(post.id, 'LIKE'),
                ),
                Text('${post.likeCount}'),
                const SizedBox(width: 24),
                const Icon(Icons.chat_bubble_outline),
                const SizedBox(width: 8),
                Text('${post.commentCount}'),
                const Spacer(),
                Text(
                  _formatDate(post.createdAt),
                  style: const TextStyle(color: Colors.grey, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _formatDate(DateTime dt) {
    return '${dt.day}/${dt.month}/${dt.year}';
  }
}
