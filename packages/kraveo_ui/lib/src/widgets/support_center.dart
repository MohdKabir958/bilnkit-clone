import 'dart:typed_data';
import 'package:flutter/material.dart';

typedef SupportCall = Future<Map<String, dynamic>> Function(
  String method,
  String path, [
  Map<String, dynamic>? data,
]);

class SupportCenter extends StatefulWidget {
  const SupportCenter(
      {super.key,
      required this.call,
      this.orderId,
      this.initialCaseId,
      this.attachPhoto,
      this.readPhoto});
  final SupportCall call;
  final String? orderId;
  final String? initialCaseId;
  final Future<void> Function(String caseId)? attachPhoto;
  final Future<Uint8List> Function(String caseId, String evidenceId)? readPhoto;
  @override
  State<SupportCenter> createState() => _SupportCenterState();
}

class _SupportCenterState extends State<SupportCenter> {
  final message = TextEditingController();
  List<dynamic> cases = [];
  static const topics = {
    'MISSING_ITEM': 'Missing item',
    'WRONG_ITEM': 'Wrong item',
    'DAMAGED_ITEM': 'Damaged item',
    'EXPIRED_ITEM': 'Expired item',
    'DELAYED_DELIVERY': 'Delayed delivery',
    'RIDER_PROBLEM': 'Rider problem',
    'PAYMENT_CHARGED': 'Payment failed but charged',
    'REFUND_NOT_RECEIVED': 'Refund not received',
    'DELIVERY_FAILED': 'Delivery failed',
    'ACCOUNT_HELP': 'Account help',
    'OTHER': 'Other',
  };
  String topic = 'OTHER';
  String? cursor, error;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    load();
    if (widget.initialCaseId != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        Navigator.push(
            context,
            MaterialPageRoute<void>(
                builder: (_) => _SupportThread(
                    call: widget.call,
                    id: widget.initialCaseId!,
                    attachPhoto: widget.attachPhoto,
                    readPhoto: widget.readPhoto)));
      });
    }
  }

  @override
  void dispose() {
    message.dispose();
    super.dispose();
  }

  Future<void> load({bool more = false}) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final response = await widget.call(
        'GET',
        '/v1/support-cases?limit=30${more && cursor != null ? '&after=${Uri.encodeQueryComponent(cursor!)}' : ''}',
      );
      if (mounted)
        setState(() {
          cases = more ? [...cases, ...response['data']] : response['data'];
          cursor = response['nextCursor'];
        });
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
    if (mounted) setState(() => busy = false);
  }

  Future<void> send() async {
    if (busy) return;
    if (message.text.trim().isEmpty) {
      setState(() => error = 'Describe what you need help with.');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.call('POST', '/v1/support-cases', {
        'subject': topics[topic]!,
        'category': topic,
        'description': message.text.trim(),
        if (widget.orderId != null) 'orderId': widget.orderId,
      });
      if (!mounted) return;
      message.clear();
      await load();
    } catch (e) {
      if (mounted)
        setState(() {
          error = '$e';
          busy = false;
        });
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Help and requests')),
        body: RefreshIndicator(
          onRefresh: load,
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(
                widget.orderId == null
                    ? 'Send a request to the support team.'
                    : 'Help with order #${widget.orderId!.substring(0, widget.orderId!.length.clamp(0, 8))}',
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                isExpanded: true,
                initialValue: topic,
                items: [
                  for (final entry in topics.entries)
                    DropdownMenuItem(
                        value: entry.key,
                        child: Text(entry.value,
                            maxLines: 1, overflow: TextOverflow.ellipsis))
                ],
                onChanged: busy ? null : (v) => setState(() => topic = v!),
                decoration: const InputDecoration(
                  labelText: 'What do you need help with?',
                ),
              ),
              TextField(
                controller: message,
                enabled: !busy,
                minLines: 3,
                maxLines: 6,
                maxLength: 2000,
                decoration: const InputDecoration(
                  labelText: 'Describe the problem',
                ),
              ),
              if (error != null)
                Text(error!, style: const TextStyle(color: Colors.red)),
              FilledButton(
                onPressed: busy ? null : send,
                child: const Text('Send request'),
              ),
              const SizedBox(height: 24),
              Text('Your requests',
                  style: Theme.of(context).textTheme.titleLarge),
              if (!busy && cases.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: Text('No requests yet.'),
                ),
              for (final c in cases)
                Card(
                  child: ListTile(
                    title: Text(c['subject']),
                    subtitle: Text('${_supportStatus(c)}\n${c['description']}'),
                    isThreeLine: true,
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () async {
                      await Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => _SupportThread(
                              call: widget.call,
                              id: c['id'],
                              attachPhoto: widget.attachPhoto,
                              readPhoto: widget.readPhoto),
                        ),
                      );
                      if (mounted) await load();
                    },
                  ),
                ),
              if (cursor != null)
                TextButton(
                  onPressed: busy ? null : () => load(more: true),
                  child: const Text('Load older requests'),
                ),
            ],
          ),
        ),
      );
}

class _SupportThread extends StatefulWidget {
  const _SupportThread(
      {required this.call, required this.id, this.attachPhoto, this.readPhoto});
  final SupportCall call;
  final String id;
  final Future<void> Function(String caseId)? attachPhoto;
  final Future<Uint8List> Function(String caseId, String evidenceId)? readPhoto;
  @override
  State<_SupportThread> createState() => _SupportThreadState();
}

class _SupportThreadState extends State<_SupportThread> {
  final reply = TextEditingController();
  Map<String, dynamic>? request;
  List<dynamic> notes = [];
  String? cursor, error;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    reply.dispose();
    super.dispose();
  }

  Future<void> load({bool more = false}) async {
    setState(() => busy = true);
    try {
      final r = (await widget.call(
        'GET',
        '/v1/support-cases/${widget.id}?limit=30${more && cursor != null ? '&after=${Uri.encodeQueryComponent(cursor!)}' : ''}',
      ))['data'] as Map<String, dynamic>;
      if (mounted)
        setState(() {
          request = r;
          notes = more ? [...notes, ...r['notes']] : r['notes'];
          cursor = r['nextNotesCursor'];
          error = null;
        });
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
    if (mounted) setState(() => busy = false);
  }

  Future<void> send() async {
    if (busy || reply.text.trim().isEmpty) return;
    setState(() => busy = true);
    try {
      await widget.call('POST', '/v1/support-cases/${widget.id}/replies', {
        'message': reply.text.trim(),
      });
      if (!mounted) return;
      reply.clear();
      await load();
    } catch (e) {
      if (mounted)
        setState(() {
          error = '$e';
          busy = false;
        });
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(request?['subject'] ?? 'Request updates')),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            if (request != null) ...[
              Text(
                _supportStatus(request!),
                style: Theme.of(context).textTheme.titleLarge,
              ),
              Text(request!['description']),
              if (request!['assigned'] == true)
                const Text('A support owner is assigned.'),
              if (request!['dueAt'] != null)
                Text(
                    'Response target: ${DateTime.tryParse(request!['dueAt'].toString())?.toLocal() ?? request!['dueAt']}'),
              if (request!['escalatedAt'] != null)
                const Text('This request has been escalated for review.'),
              if (request!['refundLinked'] == true)
                const Text(
                    'A refund reference is linked. Check the order for confirmed payment status.'),
              if (request!['replacementLinked'] == true)
                const Text('A replacement reference is linked.'),
              if (request!['status'] == 'RESOLVED')
                const Text(
                    'Still need help? Sending a reply reopens this request.'),
              for (final photo in (request!['evidence'] as List? ?? []))
                TextButton.icon(
                    onPressed: busy || widget.readPhoto == null
                        ? null
                        : () async {
                            setState(() => busy = true);
                            try {
                              final bytes = await widget.readPhoto!(
                                  widget.id, photo['id']);
                              if (!mounted) return;
                              await showDialog<void>(
                                  context: context,
                                  builder: (context) => AlertDialog(
                                          title: const Text(
                                              'Private evidence photo'),
                                          content: Image.memory(bytes,
                                              fit: BoxFit.contain),
                                          actions: [
                                            TextButton(
                                                onPressed: () =>
                                                    Navigator.pop(context),
                                                child: const Text('Close'))
                                          ]));
                            } catch (e) {
                              if (mounted) setState(() => error = '$e');
                            } finally {
                              if (mounted) setState(() => busy = false);
                            }
                          },
                    icon: const Icon(Icons.image_outlined),
                    label: Text(photo['caption'] ?? 'View attached photo')),
              if (widget.attachPhoto != null)
                OutlinedButton.icon(
                    onPressed: busy
                        ? null
                        : () async {
                            setState(() => busy = true);
                            try {
                              await widget.attachPhoto!(widget.id);
                              if (mounted) await load();
                            } catch (e) {
                              if (mounted) setState(() => error = '$e');
                            } finally {
                              if (mounted) setState(() => busy = false);
                            }
                          },
                    icon: const Icon(Icons.attach_file),
                    label: const Text('Attach evidence photo')),
              if (widget.attachPhoto != null)
                const Text(
                    'Private photos are retained for 90 days. Do not attach passwords, payment-card details or identity documents.'),
              const SizedBox(height: 16),
            ],
            if (error != null)
              Text(error!, style: const TextStyle(color: Colors.red)),
            for (final n in notes)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        n['fromSupport'] == true ? 'Support team' : 'You',
                        style: Theme.of(context).textTheme.labelLarge,
                      ),
                      Text(n['message']),
                    ],
                  ),
                ),
              ),
            if (cursor != null)
              TextButton(
                onPressed: busy ? null : () => load(more: true),
                child: const Text('Load older replies'),
              ),
            TextField(
              controller: reply,
              enabled: !busy,
              minLines: 2,
              maxLines: 5,
              maxLength: 2000,
              decoration: const InputDecoration(labelText: 'Reply to support'),
            ),
            FilledButton(
              onPressed: busy ? null : send,
              child: const Text('Send reply'),
            ),
          ],
        ),
      );
}

String _supportStatus(Map<dynamic, dynamic> request) =>
    switch (request['status']) {
      'OPEN' => 'Waiting for support',
      'IN_PROGRESS' => 'Support is reviewing your request',
      'RESOLVED' => 'Resolved — you can reply to reopen',
      _ => 'Request submitted',
    };
