import 'package:flutter/material.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import '../services/product_api.dart';

/// Physical packing does not change the shelf count a second time. Cancelled
/// packed products remain unavailable until someone inspects their condition.
class PhysicalStockScreen extends StatefulWidget {
  const PhysicalStockScreen(
      {super.key, required this.api, required this.product});
  final ProductApi api;
  final Map<String, dynamic> product;
  @override
  State<PhysicalStockScreen> createState() => _PhysicalStockScreenState();
}

class _PhysicalStockScreenState extends State<PhysicalStockScreen> {
  List<Map<String, dynamic>> batches = [], reservations = [];
  bool loading = true, saving = false, tracking = false;
  int version = 0, epoch = 0;
  String? error, cursor;
  Future<Object?> Function()? retryAction;
  String get id => '${widget.product['id']}';
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    epoch++;
    super.dispose();
  }

  Future<void> load({bool more = false}) async {
    final generation = ++epoch;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final result = await Future.wait([
        widget.api.call('GET',
            '/v1/products/$id/batches?limit=100${more && cursor != null ? '&after=$cursor' : ''}'),
        widget.api.call('GET', '/v1/products/$id/reservations'),
      ]);
      if (!mounted || generation != epoch) return;
      setState(() {
        final next = (result[0]['data'] as List)
            .map((v) => Map<String, dynamic>.from(v))
            .toList();
        batches = more ? [...batches, ...next] : next;
        reservations = (result[1]['data'] as List)
            .map((v) => Map<String, dynamic>.from(v))
            .toList();
        tracking = result[0]['batchTracking'] == true;
        version = (result[0]['stockVersion'] as num).toInt();
        cursor = result[0]['nextCursor'];
        loading = false;
      });
    } catch (e) {
      if (mounted && generation == epoch) {
        setState(() {
          error = '$e';
          loading = false;
        });
      }
    }
  }

  Future<void> changeTracking() async {
    final fields = await _ask(context,
        title: tracking ? 'Turn off lot tracking?' : 'Track lots and expiry',
        labels: const {'reason': 'Count/reconciliation reason'},
        guidance:
            'Shelf count and active reservations must be zero. Then receive each counted lot. Existing balances are never invented.');
    if (fields == null || !mounted) return;
    await run(() => widget.api.call('PUT', '/v1/products/$id/batch-tracking',
        {'enabled': !tracking, 'reason': fields['reason']}));
  }

  Future<void> receive() async {
    final fields = await _ask(context,
        title: 'Receive a counted lot',
        labels: const {
          'lotCode': 'Lot / batch code',
          'quantity': 'Received whole packs',
          'expiry': 'Expiry date YYYY-MM-DD (optional)',
          'reason': 'Receipt / count reason'
        },
        optional: const {'expiry'},
        guidance:
            'Use the expiry printed on the pack. This date is treated as the end of that day in India. Leave blank only when no expiry applies.');
    if (fields == null || !mounted) return;
    try {
      final qty = int.tryParse(fields['quantity']!);
      if (qty == null || qty < 1) {
        throw Exception('Enter a positive whole pack count.');
      }
      final expiry = fields['expiry']!.trim();
      String? timestamp;
      if (expiry.isNotEmpty) {
        final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(expiry);
        if (match == null) {
          throw Exception('Use YYYY-MM-DD for the expiry date.');
        }
        final date = DateTime.utc(
            int.parse(match[1]!), int.parse(match[2]!), int.parse(match[3]!));
        if (date.toIso8601String().substring(0, 10) != expiry) {
          throw Exception('Choose a valid expiry date.');
        }
        timestamp = date
            .add(const Duration(days: 1))
            .subtract(const Duration(hours: 5, minutes: 30))
            .toIso8601String();
      }
      final body = {
        'lotCode': fields['lotCode'],
        'quantity': qty,
        'expiresAt': timestamp,
        'reason': fields['reason'],
        'expectedVersion': version,
        'clientRequestId': 'lot-${DateTime.now().microsecondsSinceEpoch}'
      };
      await run(
          () => widget.api.call('POST', '/v1/products/$id/batches', body));
    } catch (e) {
      setState(() => error = '$e');
    }
  }

  Future<void> correct(Map<String, dynamic> batch) async {
    final fields = await _ask(context,
        title: 'Correct lot ${batch['lotCode']}',
        labels: const {
          'delta': 'Whole pack change (+received / −written off)',
          'reason': 'Count / damage correction reason'
        },
        guidance:
            'Only available shelf packs can change here. Order reservations and packed products have their own inspection actions.');
    if (fields == null || !mounted) return;
    final delta = int.tryParse(fields['delta']!);
    if (delta == null || delta == 0) {
      setState(() => error = 'Enter a non-zero whole pack correction.');
      return;
    }
    final body = {
      'delta': delta,
      'reason': fields['reason'],
      'expectedVersion': version,
      'clientRequestId': 'lot-fix-${DateTime.now().microsecondsSinceEpoch}'
    };
    await run(() => widget.api
        .call('POST', '/v1/products/$id/batches/${batch['id']}/stock', body));
  }

  Future<void> disposition(Map<String, dynamic> row, String action) async {
    final fields = await _ask(context,
        title: action.replaceAll('_', ' '),
        labels: const {
          'quantity': 'Whole packs inspected',
          'reason': 'Physical inspection / packing reason'
        },
        guidance: action == 'RETURN'
            ? 'Confirm the packs are sealed, safe and unexpired before returning them to sale.'
            : action == 'WRITE_OFF'
                ? 'Written-off packs remain unavailable for sale.'
                : 'Record only what physically happened. A missing or damaged pack requires an order correction with customer approval.');
    if (fields == null || !mounted) return;
    final qty = int.tryParse(fields['quantity']!);
    if (qty == null || qty < 1) {
      setState(() => error = 'Enter a positive whole pack count.');
      return;
    }
    final body = {
      'action': action,
      'quantity': qty,
      'reason': fields['reason'],
      'clientRequestId': 'pack-${DateTime.now().microsecondsSinceEpoch}'
    };
    await run(() => widget.api.call(
        'POST', '/v1/inventory/reservations/${row['id']}/disposition', body));
  }

  Future<void> run(Future<Object?> Function() action) async {
    setState(() {
      saving = true;
      error = null;
      retryAction = action;
    });
    try {
      await action();
      retryAction = null;
      if (mounted) await load();
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final k = context.k;
    return Scaffold(
        appBar: AppBar(title: const Text('Lots, packing and returns')),
        body: RefreshIndicator(
            onRefresh: load,
            child: ListView(padding: const EdgeInsets.all(20), children: [
              Text('${widget.product['name']}', style: KraveoType.headlineSm),
              const SizedBox(height: 8),
              Text(
                  'Shelf stock excludes reserved packs. Cancelled packed products stay unavailable until inspected.',
                  style: KraveoType.bodySm.copyWith(color: k.inkMuted)),
              const SizedBox(height: 16),
              if (error != null) ...[
                Text(error!, style: TextStyle(color: k.error)),
                TextButton(
                    onPressed: loading || saving ? null : load,
                    child: const Text('Reload current stock'))
              ],
              if (retryAction != null && !saving) ...[
                const Text(
                    'This change has not been confirmed. Retry the same request before recording another change.'),
                TextButton(
                    onPressed: () => run(retryAction!),
                    child: const Text('Retry unconfirmed change'))
              ],
              if (loading || saving) const LinearProgressIndicator(),
              KCard(
                  elevated: false,
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Lot and expiry tracking',
                            style: KraveoType.titleLg),
                        const SizedBox(height: 8),
                        Text(tracking
                            ? 'Enabled · oldest usable expiry is reserved first.'
                            : 'Optional. Reconcile stock before enabling.'),
                        Wrap(spacing: 12, children: [
                          TextButton(
                              onPressed:
                                  saving || loading || retryAction != null
                                      ? null
                                      : changeTracking,
                              child: Text(tracking
                                  ? 'Turn off tracking'
                                  : 'Enable tracking')),
                          if (tracking)
                            TextButton.icon(
                                onPressed:
                                    saving || loading || retryAction != null
                                        ? null
                                        : receive,
                                icon: const Icon(Icons.add),
                                label: const Text('Receive lot'))
                        ])
                      ])),
              const SizedBox(height: 16),
              for (final batch in batches) ...[
                KCard(
                    elevated: false,
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                              'Lot ${batch['lotCode']} · ${batch['availableQty']} available',
                              style: KraveoType.titleMd),
                          const SizedBox(height: 4),
                          Text(batch['expiresAt'] == null
                              ? 'No expiry recorded'
                              : 'Expiry: ${DateTime.tryParse('${batch['expiresAt']}')?.toLocal().toString() ?? batch['expiresAt']}'),
                          if (batch['expiresAt'] != null &&
                              (DateTime.tryParse('${batch['expiresAt']}')
                                      ?.isBefore(DateTime.now()) ??
                                  false))
                            Text('Expired · excluded from sale',
                                style: TextStyle(color: k.error)),
                          TextButton(
                              onPressed:
                                  saving || loading || retryAction != null
                                      ? null
                                      : () => correct(batch),
                              child: const Text('Correct counted lot'))
                        ])),
                const SizedBox(height: 12)
              ],
              if (cursor != null)
                TextButton(
                    onPressed:
                        saving || loading ? null : () => load(more: true),
                    child: const Text('Load more lots')),
              const SizedBox(height: 12),
              Text('Order packing and return inspection',
                  style: KraveoType.titleLg),
              const SizedBox(height: 8),
              if (!loading && reservations.isEmpty)
                const Text('No active reservations or returns to inspect.'),
              for (final row in reservations) ...[
                KCard(
                    elevated: false,
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Order ${row['orderId']}',
                              style: KraveoType.titleMd),
                          Text(
                              '${row['state']} · ${row['quantity']} reserved\n${row['packedQty']} packed · ${row['unusableQty']} unusable · ${row['pendingInspectionQty']} awaiting inspection'),
                          const SizedBox(height: 8),
                          Wrap(spacing: 8, runSpacing: 4, children: [
                            for (final action
                                in row['state'] == 'AWAITING_INSPECTION'
                                    ? ['RETURN', 'WRITE_OFF']
                                    : [
                                        'PACK',
                                        'UNPACK',
                                        'MISSING',
                                        'DAMAGED',
                                        'EXPIRED'
                                      ])
                              OutlinedButton(
                                  onPressed:
                                      saving || loading || retryAction != null
                                          ? null
                                          : () => disposition(row, action),
                                  child: Text(action.replaceAll('_', ' ')))
                          ])
                        ])),
                const SizedBox(height: 12)
              ],
              const SizedBox(height: 30)
            ])));
  }
}

Future<Map<String, String>?> _ask(BuildContext context,
        {required String title,
        required Map<String, String> labels,
        required String guidance,
        Set<String> optional = const {}}) =>
    showDialog<Map<String, String>>(
        context: context,
        builder: (_) => _StockQuestionDialog(
            title: title,
            labels: labels,
            guidance: guidance,
            optional: optional));

class _StockQuestionDialog extends StatefulWidget {
  const _StockQuestionDialog(
      {required this.title,
      required this.labels,
      required this.guidance,
      required this.optional});
  final String title, guidance;
  final Map<String, String> labels;
  final Set<String> optional;
  @override
  State<_StockQuestionDialog> createState() => _StockQuestionDialogState();
}

class _StockQuestionDialogState extends State<_StockQuestionDialog> {
  late final fields = {
    for (final key in widget.labels.keys) key: TextEditingController()
  };
  final form = GlobalKey<FormState>();
  @override
  void dispose() {
    for (final field in fields.values) {
      field.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
          title: Text(widget.title),
          content: SingleChildScrollView(
              child: Form(
                  key: form,
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Text(widget.guidance),
                    const SizedBox(height: 12),
                    for (final field in widget.labels.entries)
                      Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: TextFormField(
                              controller: fields[field.key],
                              keyboardType:
                                  ['quantity', 'delta'].contains(field.key)
                                      ? const TextInputType.numberWithOptions(
                                          signed: true)
                                      : TextInputType.text,
                              decoration:
                                  InputDecoration(labelText: field.value),
                              validator: (v) =>
                                  !widget.optional.contains(field.key) &&
                                          (v ?? '').trim().isEmpty
                                      ? 'Required'
                                      : null))
                  ]))),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel')),
            FilledButton(
                onPressed: () {
                  if (form.currentState!.validate()) {
                    Navigator.pop(context, {
                      for (final entry in fields.entries)
                        entry.key: entry.value.text.trim()
                    });
                  }
                },
                child: const Text('Record change'))
          ]);
}
