import 'package:flutter/material.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import '../services/product_api.dart';

/// Full proposed basket; only the customer's explicit server-verified decision
/// changes the order. This screen cannot charge or approve on their behalf.
class OrderAdjustmentScreen extends StatefulWidget {
  const OrderAdjustmentScreen({super.key, required this.orderId, this.api});
  final String orderId;
  final ProductApi? api;
  @override
  State<OrderAdjustmentScreen> createState() => _OrderAdjustmentScreenState();
}

class _OrderAdjustmentScreenState extends State<OrderAdjustmentScreen> {
  late final api = widget.api ?? ProductApi();
  final reason = TextEditingController(), search = TextEditingController();
  List<Map<String, dynamic>> basket = [], products = [], proposals = [];
  String? vendorId, cursor, error;
  bool loading = true, sending = false, supported = true;
  Map<String, dynamic>? pendingBody;
  int epoch = 0;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    epoch++;
    reason.dispose();
    search.dispose();
    super.dispose();
  }

  Future<void> load() async {
    final n = ++epoch;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final values = await Future.wait([
        api.call('GET', '/orders/${widget.orderId}'),
        api.call('GET', '/v1/orders/${widget.orderId}/adjustments')
      ]);
      if (!mounted || n != epoch) return;
      final order = Map<String, dynamic>.from(values[0]['data']);
      vendorId = '${order['vendorId'] ?? order['vendor']?['id'] ?? ''}';
      setState(() {
        supported = order['workflowVersion'] == 2 &&
            order['groupId'] == null &&
            ['PLACED', 'ACCEPTED', 'PREPARING'].contains(order['status']);
        proposals = (values[1]['data'] as List)
            .map((v) => Map<String, dynamic>.from(v))
            .toList();
        if (pendingBody == null) {
          basket = (order['items'] as List)
              .map((v) => {
                    'itemId': v['menuItemId'] ?? v['menuItem']?['id'],
                    'name': v['name'] ?? v['menuItem']?['name'] ?? 'Product',
                    'quantity': v['quantity']
                  })
              .toList();
        }
        loading = false;
      });
      if (supported) await findProducts();
    } catch (e) {
      if (mounted && n == epoch) {
        setState(() {
          error = '$e';
          loading = false;
        });
      }
    }
  }

  Future<void> findProducts({bool more = false}) async {
    if (vendorId == null || vendorId!.isEmpty) return;
    setState(() => loading = true);
    try {
      final query = Uri(queryParameters: {
        'q': search.text.trim(),
        'limit': '30',
        if (more && cursor != null) 'after': cursor!
      }).query;
      final result =
          await api.call('GET', '/v1/vendors/$vendorId/products?$query');
      if (!mounted) return;
      final next = (result['data'] as List)
          .map((v) => Map<String, dynamic>.from(v))
          .where(
              (p) => p['approvalStatus'] == 'APPROVED' && p['active'] != false)
          .toList();
      setState(() {
        products = more ? [...products, ...next] : next;
        cursor = result['nextCursor'];
      });
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> send() async {
    if (pendingBody == null) {
      if (reason.text.trim().length < 5) {
        setState(() => error =
            'Explain the shortage or replacement in at least five characters.');
        return;
      }
      if (basket.isEmpty || basket.any((p) => p['itemId'] == null)) {
        setState(() => error =
            'Keep at least one identified product. If nothing can be supplied, use the order cancellation workflow.');
        return;
      }
      pendingBody = {
        'requestKey': 'shortage-${DateTime.now().microsecondsSinceEpoch}',
        'reason': reason.text.trim(),
        'items': [
          for (final p in basket)
            {'itemId': p['itemId'], 'quantity': p['quantity']}
        ]
      };
    }
    setState(() {
      sending = true;
      error = null;
    });
    try {
      await api.call(
          'POST', '/v1/orders/${widget.orderId}/adjustments', pendingBody);
      if (!mounted) return;
      pendingBody = null;
      await load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text(
                'Proposal sent. Wait for the customer to accept before changing the packed order.')));
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final k = context.k,
        pending = proposals.any((p) => p['state'] == 'PROPOSED'),
        locked = loading || sending || pendingBody != null || pending;
    return Scaffold(
        appBar: AppBar(title: const Text('Shortage or replacement')),
        body: RefreshIndicator(
            onRefresh: load,
            child: ListView(padding: const EdgeInsets.all(20), children: [
              Text('Resolve the missing packs', style: KraveoType.headlineSm),
              const SizedBox(height: 8),
              Text(
                  'Propose the complete basket you can supply. The customer must approve it. Grozo supports the same or a lower total; extra charges are not supported.',
                  style: KraveoType.bodySm.copyWith(color: k.inkMuted)),
              const SizedBox(height: 8),
              Text(
                  'Removed packs are recorded as missing and are not returned to sale automatically. Record any physical inspection or stock correction separately.',
                  style: KraveoType.bodySm.copyWith(color: k.inkMuted)),
              const SizedBox(height: 16),
              if (error != null) Text(error!, style: TextStyle(color: k.error)),
              if (loading || sending) const LinearProgressIndicator(),
              if (!supported)
                const KEmptyState(
                    icon: Icons.info_outline,
                    title: 'Item changes are unavailable',
                    message:
                        'This order is no longer at the supported packing stage. Refresh its status or contact support.'),
              for (final p in proposals) ...[
                const SizedBox(height: 12),
                KCard(
                    elevated: false,
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${p['state']}', style: KraveoType.titleMd),
                          Text('${p['reason']}'),
                          if (p['items'] is List)
                            for (final item in p['items'])
                              Text('${item['quantity']} × ${item['name']}'),
                          if (p['state'] == 'PROPOSED')
                            const Text(
                                'Waiting for customer approval. Do not supply an unapproved replacement.')
                        ]))
              ],
              if (supported) ...[
                const SizedBox(height: 20),
                Text('Proposed basket', style: KraveoType.titleLg),
                for (final item in basket) ...[
                  const SizedBox(height: 10),
                  KCard(
                      elevated: false,
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${item['name']}', style: KraveoType.titleMd),
                            Row(children: [
                              IconButton(
                                  tooltip: 'Remove one pack',
                                  onPressed: locked
                                      ? null
                                      : () => setState(() {
                                            if (item['quantity'] > 1) {
                                              item['quantity']--;
                                            } else {
                                              basket.remove(item);
                                            }
                                          }),
                                  icon:
                                      const Icon(Icons.remove_circle_outline)),
                              Text('${item['quantity']}'),
                              IconButton(
                                  tooltip: 'Add one pack',
                                  onPressed: locked || item['quantity'] >= 20
                                      ? null
                                      : () =>
                                          setState(() => item['quantity']++),
                                  icon: const Icon(Icons.add_circle_outline))
                            ])
                          ]))
                ],
                const SizedBox(height: 16),
                TextField(
                    controller: reason,
                    enabled: !locked,
                    maxLength: 300,
                    maxLines: 2,
                    decoration: const InputDecoration(
                        labelText: 'Explain the shortage or replacement')),
                if (pendingBody != null)
                  const Text(
                      'This submission is unconfirmed. Retry the original proposal before making another change.'),
                FilledButton(
                    onPressed: loading || sending || pending ? null : send,
                    child: Text(pendingBody == null
                        ? 'Send for customer approval'
                        : 'Retry the same proposal')),
                if (pending)
                  TextButton(
                      onPressed: loading || sending ? null : load,
                      child: const Text('Refresh customer decision')),
                const SizedBox(height: 24),
                Text('Choose an alternative from this store',
                    style: KraveoType.titleLg),
                const SizedBox(height: 8),
                TextField(
                    controller: search,
                    enabled: !locked,
                    onSubmitted: (_) => findProducts(),
                    decoration: InputDecoration(
                        labelText: 'Search approved products, SKU or barcode',
                        suffixIcon: IconButton(
                            onPressed: locked ? null : findProducts,
                            icon: const Icon(Icons.search)))),
                for (final p in products) ...[
                  const SizedBox(height: 8),
                  ListTile(
                      contentPadding: EdgeInsets.zero,
                      title:
                          Text('${p['name']} · ${p['packSize']} ${p['unit']}'),
                      subtitle: Text(
                          '${p['stockQty']} available · ${p['sku'] ?? ''}'),
                      trailing: TextButton(
                          onPressed: locked || (p['stockQty'] as num? ?? 0) < 1
                              ? null
                              : () => setState(() {
                                    final i = basket.indexWhere(
                                        (v) => v['itemId'] == p['id']);
                                    if (i < 0) {
                                      basket.add({
                                        'itemId': p['id'],
                                        'name':
                                            '${p['name']} · ${p['packSize']} ${p['unit']}',
                                        'quantity': 1
                                      });
                                    } else if (basket[i]['quantity'] < 20) {
                                      basket[i]['quantity']++;
                                    }
                                  }),
                          child: const Text('Add')))
                ],
                if (cursor != null)
                  TextButton(
                      onPressed: locked ? null : () => findProducts(more: true),
                      child: const Text('Load more approved products')),
              ],
              const SizedBox(height: 30)
            ])));
  }
}
