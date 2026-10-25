import 'dart:async';
import 'package:flutter/material.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import 'package:image_picker/image_picker.dart';
import '../services/product_api.dart';

class ProductInventoryScreen extends StatefulWidget {
  const ProductInventoryScreen({super.key, required this.vendorId, this.api});
  final String vendorId;
  final ProductApi? api;
  @override
  State<ProductInventoryScreen> createState() => _ProductInventoryScreenState();
}

class _ProductInventoryScreenState extends State<ProductInventoryScreen> {
  late final api = widget.api ?? ProductApi();
  final search = TextEditingController();
  List<Map<String, dynamic>> rows = [];
  String? cursor, error;
  bool busy = false;
  int epoch = 0;
  Timer? debounce;
  String filter = 'All';
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    epoch++;
    debounce?.cancel();
    search.dispose();
    super.dispose();
  }

  Future<void> load({bool more = false}) async {
    final generation = ++epoch;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final query = Uri(queryParameters: {
        'q': search.text.trim(),
        'limit': '30',
        if (more && cursor != null) 'after': cursor!
      }).query;
      final result = await api.call(
          'GET', '/v1/vendors/${widget.vendorId}/products?$query');
      if (!mounted || generation != epoch) return;
      final loaded = (result['data'] as List)
          .map((r) => Map<String, dynamic>.from(r))
          .toList();
      setState(() {
        rows = more ? [...rows, ...loaded] : loaded;
        cursor = result['nextCursor'];
      });
    } catch (e) {
      if (mounted && generation == epoch) setState(() => error = '$e');
    }
    if (mounted && generation == epoch) setState(() => busy = false);
  }

  Future<void> edit([Map<String, dynamic>? row]) async {
    final changed = await Navigator.push<bool>(
        context,
        MaterialPageRoute(
            builder: (_) =>
                ProductEditor(vendorId: widget.vendorId, api: api, row: row)));
    if (changed == true && mounted) await load();
  }

  Future<void> stock(Map<String, dynamic> row) async {
    final saved = await showDialog<bool>(
        context: context,
        builder: (_) => _StockAdjustmentDialog(api: api, row: row));
    if (saved == true && mounted) await load();
  }

  Future<void> archive(Map<String, dynamic> row) async {
    final yes = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
                title: Text('Archive ${row['name']}?'),
                content:
                    const Text('Existing orders retain their product details.'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(ctx, false),
                      child: const Text('Cancel')),
                  TextButton(
                      onPressed: () => Navigator.pop(ctx, true),
                      child: const Text('Archive'))
                ]));
    if (yes != true) return;
    try {
      await api.call('DELETE', '/v1/products/${row['id']}');
      await load();
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  Future<void> history(Map<String, dynamic> row) async {
    try {
      final result = await api.call(
          'GET', '/v1/products/${row['id']}/stock-movements?limit=100');
      if (!mounted) return;
      await showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
                  title: const Text('Recent stock movements'),
                  content: SizedBox(
                      width: 400,
                      child: SingleChildScrollView(
                          child: Column(mainAxisSize: MainAxisSize.min, children: [
                        for (final r in result['data'])
                          ListTile(
                              title: Text('${r['kind']} ${r['delta']}'),
                              subtitle:
                                  Text('${r['reason']}\n${r['createdAt']}'))
                      ]))),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(ctx),
                        child: const Text('Close'))
                  ]));
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final k = context.k;
    final visible = rows
        .where((row) => switch (filter) {
              'Low stock' => row['lowStock'] == true,
              'Out of stock' => row['stockQty'] == 0,
              'Pending' => row['approvalStatus'] == 'PENDING',
              _ => true,
            })
        .toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Products and inventory')),
      floatingActionButton: FloatingActionButton.extended(
          onPressed: busy ? null : () => edit(),
          label: const Text('Add product'),
          icon: const Icon(Icons.add)),
      body: RefreshIndicator(
          onRefresh: load,
          child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                    child: Padding(
                        padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Keep your shelves ready',
                                  style: KraveoType.headlineSm),
                              const SizedBox(height: 6),
                              Text(
                                  'Add a product with a photo, pack size and price. Receive stock, wait for Grozo product approval, then switch your store to OPEN. Stock changes apply immediately.',
                                  style: KraveoType.bodySm
                                      .copyWith(color: k.inkMuted)),
                              const SizedBox(height: 16),
                              Wrap(spacing: 8, runSpacing: 8, children: [
                                _InventoryStat(
                                    label: 'Loaded products',
                                    value: rows.length),
                                _InventoryStat(
                                    label: 'Low stock',
                                    value: rows
                                        .where((p) => p['lowStock'] == true)
                                        .length),
                                _InventoryStat(
                                    label: 'Pending approval',
                                    value: rows
                                        .where((p) =>
                                            p['approvalStatus'] == 'PENDING')
                                        .length),
                              ]),
                              const SizedBox(height: 16),
                              TextField(
                                  controller: search,
                                  decoration: InputDecoration(
                                      labelText: 'Search products or SKU',
                                      prefixIcon: const Icon(Icons.search),
                                      suffixIcon: IconButton(
                                          tooltip: 'Search inventory',
                                          onPressed: busy ? null : load,
                                          icon:
                                              const Icon(Icons.arrow_forward))),
                                  onChanged: (_) {
                                    debounce?.cancel();
                                    debounce = Timer(
                                        const Duration(milliseconds: 350), () {
                                      if (mounted) load();
                                    });
                                  },
                                  onSubmitted: (_) {
                                    debounce?.cancel();
                                    load();
                                  }),
                              const SizedBox(height: 12),
                              Wrap(spacing: 8, runSpacing: 8, children: [
                                for (final label in [
                                  'All',
                                  'Low stock',
                                  'Out of stock',
                                  'Pending'
                                ])
                                  KChoiceChip(
                                      label: label,
                                      selected: filter == label,
                                      onTap: () =>
                                          setState(() => filter = label))
                              ]),
                              if (error != null) ...[
                                const SizedBox(height: 12),
                                Text(error!,
                                    style: KraveoType.bodySm
                                        .copyWith(color: k.error)),
                                TextButton(
                                    onPressed: busy ? null : load,
                                    child: const Text('Try again'))
                              ],
                              if (busy)
                                const Padding(
                                    padding: EdgeInsets.only(top: 12),
                                    child: LinearProgressIndicator()),
                              if (cursor != null)
                                Padding(
                                    padding: const EdgeInsets.only(top: 8),
                                    child: Text(
                                        'Counts and filters cover loaded products. Load more to include the next page.',
                                        style: KraveoType.caption
                                            .copyWith(color: k.inkMuted))),
                            ]))),
                if (!busy && visible.isEmpty)
                  const SliverToBoxAdapter(
                      child: KEmptyState(
                          icon: Icons.inventory_2_outlined,
                          title: 'No products found',
                          message:
                              'Add a product or change your search and filters.')),
                SliverPadding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    sliver: SliverList.builder(
                        itemCount: visible.length,
                        itemBuilder: (context, index) {
                          final row = visible[index];
                          final stockQty = row['stockQty'] as num? ?? 0;
                          final images = row['imageUrls'] as List? ?? [];
                          return Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: KCard(
                                  elevated: false,
                                  padding: const EdgeInsets.all(14),
                                  child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              SizedBox(
                                                  width: 64,
                                                  height: 76,
                                                  child: KProductMedia(
                                                      url: images.isEmpty
                                                          ? ''
                                                          : '${images.first}',
                                                      label: '${row['name']}')),
                                              const SizedBox(width: 12),
                                              Expanded(
                                                  child: Column(
                                                      crossAxisAlignment:
                                                          CrossAxisAlignment
                                                              .start,
                                                      children: [
                                                    Text(
                                                        '${row['name']} · ${row['packSize']} ${row['unit']}',
                                                        style:
                                                            KraveoType.titleMd),
                                                    const SizedBox(height: 4),
                                                    Text(
                                                        'SKU ${row['sku'] ?? 'needs setup'}',
                                                        style: KraveoType
                                                            .caption
                                                            .copyWith(
                                                                color: k
                                                                    .inkMuted)),
                                                    Text(
                                                        '₹${((row['pricePaise'] as num) / 100).toStringAsFixed(2)}',
                                                        style: KraveoType
                                                            .titleMd
                                                            .copyWith(
                                                                color: k.ink)),
                                                  ])),
                                              PopupMenuButton<String>(
                                                  tooltip: 'Product actions',
                                                  onSelected: (action) {
                                                    if (action ==
                                                        'Edit / variants') {
                                                      edit(row);
                                                    }
                                                    if (action == 'History') {
                                                      history(row);
                                                    }
                                                    if (action == 'Archive') {
                                                      archive(row);
                                                    }
                                                  },
                                                  itemBuilder: (_) => [
                                                        for (final action in [
                                                          'Edit / variants',
                                                          'History',
                                                          'Archive'
                                                        ])
                                                          PopupMenuItem(
                                                              value: action,
                                                              enabled: !busy,
                                                              child:
                                                                  Text(action))
                                                      ]),
                                            ]),
                                        const SizedBox(height: 12),
                                        Wrap(
                                            spacing: 8,
                                            runSpacing: 8,
                                            children: [
                                              _InventoryBadge(
                                                  label:
                                                      '${row['approvalStatus'] ?? 'Unknown approval'}',
                                                  color:
                                                      row['approvalStatus'] ==
                                                              'APPROVED'
                                                          ? k.success
                                                          : k.warning),
                                              _InventoryBadge(
                                                  label: stockQty == 0
                                                      ? 'Out of stock'
                                                      : '${stockQty.toInt()} packs${row['lowStock'] == true ? ' · Low stock' : ' available'}',
                                                  color: stockQty == 0
                                                      ? k.error
                                                      : row['lowStock'] == true
                                                          ? k.warning
                                                          : k.inkMuted),
                                            ]),
                                        if (row['rejectionReason'] != null)
                                          Padding(
                                              padding:
                                                  const EdgeInsets.only(top: 8),
                                              child: Text(
                                                  '${row['rejectionReason']}',
                                                  style: KraveoType.bodySm
                                                      .copyWith(
                                                          color: k.error))),
                                        const SizedBox(height: 8),
                                        Wrap(spacing: 8, children: [
                                          TextButton.icon(
                                              onPressed:
                                                  busy ? null : () => edit(row),
                                              icon: const Icon(
                                                  Icons.edit_outlined,
                                                  size: 18),
                                              label: const Text(
                                                  'Edit / variants')),
                                          TextButton.icon(
                                              onPressed: busy
                                                  ? null
                                                  : () => stock(row),
                                              icon: const Icon(
                                                  Icons.inventory_2_outlined,
                                                  size: 18),
                                              label: const Text('Adjust stock'))
                                        ]),
                                      ])));
                        })),
                if (cursor != null)
                  SliverToBoxAdapter(
                      child: TextButton(
                          onPressed: busy ? null : () => load(more: true),
                          child: const Text('Load more products'))),
                const SliverToBoxAdapter(child: SizedBox(height: 100)),
              ])),
    );
  }
}

class _InventoryStat extends StatelessWidget {
  const _InventoryStat({required this.label, required this.value});
  final String label;
  final int value;
  @override
  Widget build(BuildContext context) => Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
          color: context.k.surface,
          border: Border.all(color: context.k.line),
          borderRadius: KRadius.card),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('$value', style: KraveoType.titleLg),
        Text(label,
            style: KraveoType.caption.copyWith(color: context.k.inkMuted))
      ]));
}

class _InventoryBadge extends StatelessWidget {
  const _InventoryBadge({required this.label, required this.color});
  final String label;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
          color: color.withValues(alpha: .08),
          borderRadius: BorderRadius.circular(6)),
      child: Text(label.replaceAll('_', ' '),
          style: KraveoType.caption.copyWith(color: color)));
}

class _StockAdjustmentDialog extends StatefulWidget {
  const _StockAdjustmentDialog({required this.api, required this.row});
  final ProductApi api;
  final Map<String, dynamic> row;
  @override
  State<_StockAdjustmentDialog> createState() => _StockAdjustmentDialogState();
}

class _StockAdjustmentDialogState extends State<_StockAdjustmentDialog> {
  final delta = TextEditingController(), reason = TextEditingController();
  final requestId = 'stock-${DateTime.now().microsecondsSinceEpoch}';
  String? problem;
  bool saving = false;
  @override
  void dispose() {
    delta.dispose();
    reason.dispose();
    super.dispose();
  }

  Future<void> save() async {
    final quantity = int.tryParse(delta.text);
    if (quantity == null || reason.text.trim().isEmpty) {
      setState(() => problem = 'Enter whole packs and an adjustment reason.');
      return;
    }
    setState(() {
      saving = true;
      problem = null;
    });
    try {
      await widget.api.call('POST', '/v1/products/${widget.row['id']}/stock', {
        'delta': quantity,
        'expectedVersion': widget.row['stockVersion'],
        'reason': reason.text.trim(),
        'clientRequestId': requestId
      });
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() {
          problem = '$e';
          saving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
          title: Text('Adjust ${widget.row['name']}'),
          content: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(
                'Available: ${widget.row['stockQty']} packs. Reservations have already been deducted.'),
            TextField(
                controller: delta,
                enabled: !saving,
                keyboardType:
                    const TextInputType.numberWithOptions(signed: true),
                decoration: const InputDecoration(
                    labelText: 'Change (+received / −removed)')),
            TextField(
                controller: reason,
                enabled: !saving,
                maxLength: 200,
                decoration: const InputDecoration(labelText: 'Reason')),
            if (problem != null)
              Text(problem!, style: const TextStyle(color: Colors.red)),
          ])),
          actions: [
            TextButton(
                onPressed: saving ? null : () => Navigator.pop(context, false),
                child: const Text('Cancel')),
            TextButton(
                onPressed: saving ? null : save,
                child: Text(saving ? 'Saving…' : 'Save adjustment'))
          ]);
}

class ProductEditor extends StatefulWidget {
  const ProductEditor(
      {super.key, required this.vendorId, required this.api, this.row});
  final String vendorId;
  final ProductApi api;
  final Map<String, dynamic>? row;
  @override
  State<ProductEditor> createState() => _ProductEditorState();
}

class _ProductEditorState extends State<ProductEditor> {
  final form = GlobalKey<FormState>();
  late final fields = {
    for (final k in [
      'name',
      'sku',
      'productKey',
      'packSize',
      'price',
      'mrp',
      'description',
      'barcode',
      'hsnCode',
      'tax',
      'imageUrls',
      'threshold'
    ])
      k: TextEditingController()
  };
  List<dynamic> categories = [];
  String? categoryId, error;
  String unit = 'pcs';
  bool active = true, saving = false;
  @override
  void initState() {
    super.initState();
    final r = widget.row;
    if (r != null) {
      for (final k in [
        'name',
        'sku',
        'productKey',
        'packSize',
        'description',
        'barcode',
        'hsnCode'
      ]) {
        fields[k]!.text = '${r[k] ?? ''}';
      }
      fields['price']!.text =
          ((r['pricePaise'] as num) / 100).toStringAsFixed(2);
      fields['mrp']!.text = r['mrpPaise'] == null
          ? ''
          : ((r['mrpPaise'] as num) / 100).toStringAsFixed(2);
      fields['tax']!.text = ((r['taxRateBps'] as num? ?? 0) / 100).toString();
      fields['threshold']!.text = '${r['lowStockThreshold'] ?? 5}';
      fields['imageUrls']!.text = ((r['imageUrls'] as List?) ?? []).join('\n');
      unit = r['unit'] ?? 'pcs';
      active = r['active'] == true;
      categoryId = r['categoryId'];
    } else {
      fields['packSize']!.text = '1';
      fields['tax']!.text = '0';
      fields['threshold']!.text = '5';
    }
    loadCategories();
  }

  Future<void> loadCategories() async {
    try {
      final r = await widget.api.call('GET', '/categories?for=dishes');
      if (mounted) setState(() => categories = r['data']);
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  @override
  void dispose() {
    for (final c in fields.values) {
      c.dispose();
    }
    super.dispose();
  }

  int paise(String value) {
    if (!RegExp(r'^\d+(\.\d{1,2})?$').hasMatch(value.trim())) {
      throw const FormatException('Enter rupees with up to two decimals.');
    }
    final p = value.trim().split('.');
    return int.parse(p[0]) * 100 +
        int.parse((p.length == 1 ? '' : p[1]).padRight(2, '0'));
  }

  Future<void> uploadImage() async {
    if (saving) return;
    try {
      final image = await ImagePicker().pickImage(
          source: ImageSource.gallery,
          maxWidth: 2400,
          maxHeight: 2400,
          imageQuality: 85);
      if (image == null || !mounted) return;
      setState(() => saving = true);
      final bytes = await image.readAsBytes();
      if (bytes.length > 1024 * 1024) {
        throw Exception('Choose a photo smaller than 1 MB.');
      }
      final mime = bytes.length > 3 && bytes[0] == 0xff && bytes[1] == 0xd8
          ? 'image/jpeg'
          : bytes.length > 8 && bytes[0] == 0x89
              ? 'image/png'
              : 'image/webp';
      final url = await widget.api.uploadImage(bytes, mime);
      if (mounted) {
        fields['imageUrls']!.text = [fields['imageUrls']!.text.trim(), url]
            .where((s) => s.isNotEmpty)
            .join('\n');
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> save({bool variant = false}) async {
    if (!form.currentState!.validate() || saving) return;
    setState(() {
      saving = true;
      error = null;
    });
    try {
      final body = <String, dynamic>{
        for (final k in [
          'name',
          'sku',
          'productKey',
          'packSize',
          'description',
          'barcode',
          'hsnCode'
        ])
          k: fields[k]!.text.trim(),
        'unit': unit,
        'categoryId': categoryId,
        'pricePaise': paise(fields['price']!.text),
        'mrpPaise':
            fields['mrp']!.text.isEmpty ? null : paise(fields['mrp']!.text),
        'taxRateBps': paise(fields['tax']!.text),
        'lowStockThreshold': int.parse(fields['threshold']!.text),
        'imageUrls': fields['imageUrls']!
            .text
            .split('\n')
            .map((s) => s.trim())
            .where((s) => s.isNotEmpty)
            .toList(),
        'isAvailable': active
      };
      final id = widget.row?['id'];
      await widget.api.call(
          id == null || variant ? 'POST' : 'PUT',
          id == null || variant
              ? '/v1/vendors/${widget.vendorId}/products'
              : '/v1/products/$id',
          body);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() {
          error = '$e';
          saving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(
          title: Text(widget.row == null
              ? 'Add grocery product'
              : 'Edit grocery product')),
      body: Form(
          key: form,
          child: ListView(padding: const EdgeInsets.all(20), children: [
            Text('Product details', style: KraveoType.headlineSm),
            const SizedBox(height: 8),
            Text(
                'Create one sellable pack per SKU. Related packs share a product group.',
                style: KraveoType.bodySm.copyWith(color: context.k.inkMuted)),
            const SizedBox(height: 16),
            if (error != null)
              Text(error!, style: const TextStyle(color: Colors.red)),
            OutlinedButton.icon(
                onPressed: saving ? null : uploadImage,
                icon: const Icon(Icons.add_photo_alternate),
                label: const Text('Upload an owned product photo')),
            for (final entry in {
              'name': 'Product name',
              'sku': 'Unique SKU',
              'productKey': 'Product group (same for variants)',
              'packSize': 'Pack quantity',
              'price': 'Selling price (₹, tax included)',
              'mrp': 'MRP (₹, optional)',
              'description': 'Description',
              'barcode': 'Barcode (optional)',
              'hsnCode': 'HSN (optional)',
              'tax': 'Tax rate (%)',
              'imageUrls': 'Owned HTTPS image URLs (one per line)',
              'threshold': 'Low stock threshold'
            }.entries) ...[
              if (entry.key == 'price' ||
                  entry.key == 'description' ||
                  entry.key == 'barcode' ||
                  entry.key == 'imageUrls')
                Padding(
                    padding: const EdgeInsets.only(top: 20, bottom: 12),
                    child: Text(
                        switch (entry.key) {
                          'price' => 'Pricing',
                          'description' => 'Product information',
                          'barcode' => 'Tax and identifiers',
                          _ => 'Photos and stock'
                        },
                        style: KraveoType.titleLg)),
              Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: TextFormField(
                      controller: fields[entry.key],
                      enabled: !saving,
                      maxLines:
                          entry.key == 'description' || entry.key == 'imageUrls'
                              ? 3
                              : 1,
                      keyboardType: ['price', 'mrp', 'tax'].contains(entry.key)
                          ? const TextInputType.numberWithOptions(decimal: true)
                          : ['threshold'].contains(entry.key)
                              ? TextInputType.number
                              : TextInputType.text,
                      decoration: InputDecoration(
                          labelText: entry.value, alignLabelWithHint: true),
                      validator: (v) => [
                                'name',
                                'sku',
                                'productKey',
                                'packSize',
                                'price',
                                'tax',
                                'threshold'
                              ].contains(entry.key) &&
                              (v ?? '').trim().isEmpty
                          ? 'Required'
                          : null)),
            ],
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
                initialValue: unit,
                items: [
                  for (final u in ['g', 'kg', 'ml', 'l', 'pcs', 'pack'])
                    DropdownMenuItem(value: u, child: Text(u))
                ],
                onChanged: saving ? null : (v) => setState(() => unit = v!),
                decoration:
                    const InputDecoration(labelText: 'Measurement unit')),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
                initialValue: categories.any((c) => c['id'] == categoryId)
                    ? categoryId
                    : null,
                items: [
                  for (final c in categories)
                    DropdownMenuItem<String>(
                        value: c['id'], child: Text(c['name']))
                ],
                onChanged:
                    saving ? null : (v) => setState(() => categoryId = v),
                validator: (v) =>
                    v == null ? 'Choose a configured category' : null,
                decoration:
                    const InputDecoration(labelText: 'Product category')),
            SwitchListTile(
                value: active,
                onChanged: saving ? null : (v) => setState(() => active = v),
                title: const Text('Active product')),
            FilledButton(
                onPressed: saving ? null : save,
                child: Text(saving ? 'Saving…' : 'Save for approval')),
            if (widget.row != null)
              OutlinedButton(
                  onPressed: saving ? null : () => save(variant: true),
                  child: const Text('Add as another variant (use a new SKU)')),
            const SizedBox(height: 24),
          ])));
}
