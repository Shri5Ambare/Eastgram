import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../../providers/auth_provider.dart';
import '../../../models/models.dart';
import '../../../services/poll_service.dart';

class PollsListScreen extends StatefulWidget {
  const PollsListScreen({super.key});

  @override
  State<PollsListScreen> createState() => _PollsListScreenState();
}

class _PollsListScreenState extends State<PollsListScreen> {
  late final PollService _pollService;
  List<Poll> _polls = [];
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    final auth = Provider.of<AuthProvider>(context, listen: false);
    _pollService = PollService(apiClient: auth.apiClient);
    _fetchPolls();
  }

  Future<void> _fetchPolls() async {
    setState(() => _isLoading = true);
    try {
      final list = await _pollService.listPolls();
      setState(() => _polls = list);
    } catch (_) {
      // Handle error
    } finally {
      setState(() => _isLoading = false);
    }
  }

  void _vote(String pollId, {String? optionId, String? candidateId, String? category}) async {
    try {
      await _pollService.vote(pollId, optionId: optionId, candidateId: candidateId, category: category);
      _fetchPolls(); // Refresh list to get updated vote counts & state
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Vote cast successfully!'), backgroundColor: Colors.green),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceFirst('Exception: ', '')), backgroundColor: Colors.redAccent),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Polls & Voting',
          style: TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF764BA2)),
        ),
        backgroundColor: Colors.white,
        elevation: 0.5,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.black87),
            onPressed: _fetchPolls,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _polls.isEmpty
              ? const Center(child: Text('No polls active at this time.'))
              : ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: _polls.length,
                  itemBuilder: (ctx, idx) {
                    final poll = _polls[idx];
                    return _PollCard(
                      poll: poll,
                      onVote: (optId, candId, cat) => _vote(
                        poll.id,
                        optionId: optId,
                        candidateId: candId,
                        category: cat,
                      ),
                    );
                  },
                ),
    );
  }
}

class _PollCard extends StatelessWidget {
  final Poll poll;
  final Function(String? optionId, String? candidateId, String? category) onVote;

  const _PollCard({required this.poll, required this.onVote});

  @override
  Widget build(BuildContext context) {
    final hasVoted = poll.myVotes.isNotEmpty;

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      elevation: 3,
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFF764BA2).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    poll.type,
                    style: const TextStyle(color: Color(0xFF764BA2), fontSize: 11, fontWeight: FontWeight.bold),
                  ),
                ),
                const Spacer(),
                Text(
                  poll.status,
                  style: TextStyle(
                    color: poll.status == 'OPEN' ? Colors.green : Colors.red,
                    fontWeight: FontWeight.bold,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              poll.question,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
            ),
            if (poll.description != null) ...[
              const SizedBox(height: 6),
              Text(
                poll.description!,
                style: const TextStyle(color: Colors.grey, fontSize: 13),
              ),
            ],
            const SizedBox(height: 16),

            // Option selection or Candidate grid
            if (poll.type == 'QUICK')
              Column(
                children: poll.options.map((opt) {
                  final totalVotes = poll.options.fold(0, (sum, o) => sum + o.voteCount);
                  final percent = totalVotes == 0 ? 0.0 : (opt.voteCount / totalVotes);
                  
                  // check if I voted for this specific option
                  final isMyVote = poll.myVotes.any((v) => v['optionId'] == opt.id);

                  return Container(
                    margin: const EdgeInsets.symmetric(vertical: 6),
                    child: InkWell(
                      onTap: hasVoted ? null : () => onVote(opt.id, null, null),
                      borderRadius: BorderRadius.circular(10),
                      child: Stack(
                        children: [
                          // Progress fill background
                          FractionallySizedBox(
                            widthFactor: percent,
                            child: Container(
                              height: 48,
                              decoration: BoxDecoration(
                                color: isMyVote 
                                    ? const Color(0xFF764BA2).withOpacity(0.2)
                                    : Colors.grey[200],
                                borderRadius: BorderRadius.circular(10),
                              ),
                            ),
                          ),
                          Container(
                            height: 48,
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            alignment: Alignment.centerLeft,
                            child: Row(
                              children: [
                                Text(
                                  opt.label,
                                  style: TextStyle(
                                    fontWeight: isMyVote ? FontWeight.bold : FontWeight.normal,
                                    color: Colors.black87,
                                  ),
                                ),
                                const Spacer(),
                                if (hasVoted)
                                  Text(
                                    '${(percent * 100).toStringAsFixed(0)}% (${opt.voteCount})',
                                    style: const TextStyle(color: Colors.black54),
                                  ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              )
            else
              // ELECTION or PAGEANT candidates
              Column(
                children: poll.candidates.map((cand) {
                  final isMyVote = poll.myVotes.any((v) => v['candidateId'] == cand.id);

                  return Card(
                    color: isMyVote ? const Color(0xFF764BA2).withOpacity(0.05) : Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                      side: isMyVote ? const BorderSide(color: Color(0xFF764BA2), width: 1.5) : BorderSide.none,
                    ),
                    margin: const EdgeInsets.symmetric(vertical: 6),
                    child: ListTile(
                      leading: CircleAvatar(
                        backgroundImage: cand.photoUrl != null ? CachedNetworkImageProvider(cand.photoUrl!) : null,
                        child: cand.photoUrl == null ? const Icon(Icons.person) : null,
                      ),
                      title: Text(
                        cand.displayName,
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      subtitle: cand.category != null ? Text(cand.category!) : null,
                      trailing: hasVoted
                          ? Text('${cand.voteCount} votes', style: const TextStyle(color: Colors.black54))
                          : ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF764BA2),
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(horizontal: 12),
                              ),
                              onPressed: () => onVote(null, cand.id, cand.category),
                              child: const Text('Vote'),
                            ),
                    ),
                  );
                }).toList(),
              ),
          ],
        ),
      ),
    );
  }
}
