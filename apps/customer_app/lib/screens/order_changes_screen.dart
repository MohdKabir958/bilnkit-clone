import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import '../services/customer_api_service.dart';

/// The server owns prices, inventory and the decision. A lost answer retries the same decision key.
class OrderChangesScreen extends StatefulWidget {
  const OrderChangesScreen({super.key, required this.orderId});
  final String orderId;
  @override
  State<OrderChangesScreen> createState() => _OrderChangesScreenState();
}

class _OrderChangesScreenState extends State<OrderChangesScreen> {
  List<Map<String, dynamic>> proposals = [];
  final Map<String, Map<String, dynamic>> unconfirmed = {};
  bool loading = true, busy = false;
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<Map<String, dynamic>> call(String method, String path,
      [Map<String, dynamic>? body]) async {
    final result =
        await CustomerApiService.authorizedRequest(method, path, body: body);
    final data = jsonDecode(result.body) as Map<String, dynamic>;
    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw Exception(
          data['message'] ?? 'Could not check the order. Please retry.');
    }
    return data;
  }

  Future<void> load() async {
    if (mounted) {
      setState(() {
        loading = true;
        error = null;
      });
    }
    try {
      final data =
          await call('GET', '/v1/orders/${widget.orderId}/adjustments');
      if (mounted) {
        setState(() => proposals = (data['data'] as List)
            .map((e) => Map<String, dynamic>.from(e))
            .toList());
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> decide(Map<String, dynamic> proposal, String decision) async {
    final id = '${proposal['id']}';
    final request = unconfirmed.putIfAbsent(
        id,
        () => {
              'requestKey': 'decision-${DateTime.now().microsecondsSinceEpoch}',
              'version': proposal['version'],
              'decision': decision
            });
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await call('POST', '/v1/order-adjustments/$id/decision', request);
      unconfirmed.remove(id);
      await load();
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  String money(Object? value) =>
      '₹${((value as num? ?? 0) / 100).toStringAsFixed(2)}';

  String deadline(Object? value) {
    final date = DateTime.tryParse('$value')?.toLocal();
    if (date == null) return 'Ask the store when this proposal expires.';
    return 'Reply before ${MaterialLocalizations.of(context).formatShortDate(date)} at ${TimeOfDay.fromDateTime(date).format(context)}';
  }

  @override
  Widget build(BuildContext context) {
    final k = context.k;
    return Scaffold(
        appBar: AppBar(title: const Text('Review item changes')),
        body: RefreshIndicator(
            onRefresh: load,
            child: ListView(padding: const EdgeInsets.all(20), children: [
              Text('Your choice, before packing', style: KraveoType.headlineSm),
              const SizedBox(height: 8),
              Text(
                  'The store may suggest a replacement or fewer packs. Check the complete basket and updated total. Your order changes only after you accept.',
                  style: KraveoType.body.copyWith(color: k.inkMuted)),
              if (loading || busy) const LinearProgressIndicator(),
              if (error != null) Text(error!, style: TextStyle(color: k.error)),
              if (!loading && proposals.isEmpty)
                const Padding(
                    padding: EdgeInsets.all(24),
                    child: Text('No item changes have been proposed.')),
              for (final p in proposals)
                Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: KCard(
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                          Text('${p['state']}', style: KraveoType.titleLg),
                          Text('${p['reason']}'),
                          const SizedBox(height: 12),
                          for (final item in p['items'] as List? ?? [])
                            Text(
                                '${item['quantity']} × ${item['name']} · ₹${(item['price'] as num? ?? 0).toStringAsFixed(2)} each'),
                          const Divider(),
                          Text(
                              'Original total ${money(p['originalTotalPaise'])}'),
                          Text(
                              'Updated total ${money(p['proposedTotalPaise'])}',
                              style: KraveoType.titleMd),
                          if (p['amounts'] is Map) ...[
                            Text(
                                'Products ₹${(p['amounts']['subtotal'] as num).toStringAsFixed(2)}'),
                            Text(
                                'Delivery ₹${(p['amounts']['deliveryFee'] as num).toStringAsFixed(2)}'),
                            Text(
                                'Tax and packaging ₹${(p['amounts']['taxAndPackaging'] as num).toStringAsFixed(2)}'),
                            Text(
                                'Discount −₹${(p['amounts']['discount'] as num).toStringAsFixed(2)}'),
                            if (p['amounts']['couponMessage'] is String)
                              Text(
                                  '${p['amounts']['couponMessage']} The updated total reflects the applicable discount.'),
                          ],
                          if ((p['refundDuePaise'] as num? ?? 0) > 0)
                            Text(
                                'Difference ${money(p['refundDuePaise'])}. Online refunds are queued after acceptance; bank confirmation can take time. Cash due is reduced before delivery.'),
                          if (p['state'] == 'PROPOSED') ...[
                            const SizedBox(height: 14),
                            Text(deadline(p['expiresAt'])),
                            if (unconfirmed.containsKey('${p['id']}'))
                              TextButton(
                                  onPressed: busy
                                      ? null
                                      : () => decide(p,
                                          '${unconfirmed['${p['id']}']!['decision']}'),
                                  child:
                                      const Text('Recheck the same decision'))
                            else
                              Wrap(spacing: 12, children: [
                                FilledButton(
                                    onPressed:
                                        busy ? null : () => decide(p, 'ACCEPT'),
                                    child: const Text('Accept updated basket')),
                                OutlinedButton(
                                    onPressed:
                                        busy ? null : () => decide(p, 'REJECT'),
                                    child: const Text('Keep original request'))
                              ]),
                          ],
                          if (p['state'] == 'REJECTED')
                            const Text(
                                'The original order remains. The store must resolve the shortage or cancel safely.'),
                        ]))),
              const SizedBox(height: 30),
            ])));
  }
}
