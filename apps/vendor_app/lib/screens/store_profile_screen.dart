import 'package:flutter/material.dart';
import '../services/product_api.dart';
import 'preparation_settings_screen.dart';
import 'store_performance_screen.dart';

class StoreProfileScreen extends StatefulWidget {
  const StoreProfileScreen({super.key, this.api, this.vendorId});
  final ProductApi? api;
  final String? vendorId;
  @override
  State<StoreProfileScreen> createState() => _StoreProfileScreenState();
}

class _StoreProfileScreenState extends State<StoreProfileScreen> {
  late final api = widget.api ?? ProductApi();
  final form = GlobalKey<FormState>();
  final name = TextEditingController();
  final address = TextEditingController();
  final banner = TextEditingController();
  Map<String, dynamic>? store;
  bool busy = true;
  String? error, saved;

  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    name.dispose();
    address.dispose();
    banner.dispose();
    super.dispose();
  }

  Future<void> load() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final result = await api.call('GET',
          '/v1/partner/store${widget.vendorId == null ? '' : '?vendorId=${Uri.encodeComponent(widget.vendorId!)}'}');
      if (!mounted) return;
      final data = Map<String, dynamic>.from(result['data']);
      setState(() {
        store = data;
        name.text = data['name'];
        address.text = data['address'];
        banner.text = data['bannerImage'] ?? '';
      });
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
    if (mounted) setState(() => busy = false);
  }

  Future<void> save() async {
    if (busy || !form.currentState!.validate()) return;
    if (address.text.trim() != store?['address']) {
      final confirmed = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
                title: const Text('Confirm pickup address change'),
                content: const Text(
                    'New orders will be paused for this store until operations reconfirms your pickup location and delivery coverage. Existing orders remain accessible.'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(ctx, false),
                      child: const Text('Keep editing')),
                  FilledButton(
                      onPressed: () => Navigator.pop(ctx, true),
                      child: const Text('Update address'))
                ],
              ));
      if (confirmed != true || !mounted) return;
    }
    setState(() {
      busy = true;
      error = null;
      saved = null;
    });
    try {
      final result = await api.call(
          'PUT',
          '/v1/partner/store${widget.vendorId == null ? '' : '?vendorId=${Uri.encodeComponent(widget.vendorId!)}'}',
          {
            'name': name.text.trim(),
            'address': address.text.trim(),
            'bannerImage': banner.text.trim()
          });
      if (!mounted) return;
      setState(() {
        store = Map<String, dynamic>.from(result['data']);
        saved = result['coverageNeedsReview'] == true
            ? 'Saved. Ask operations to reconfirm your location and delivery coverage before accepting new orders.'
            : 'Store profile saved.';
      });
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
    if (mounted) setState(() => busy = false);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Store profile'), actions: [
          if (store?['id'] != null)
            IconButton(
                tooltip: 'Store performance',
                icon: const Icon(Icons.insights),
                onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => StorePerformanceScreen(
                        vendorId: '${store!['id']}', api: api)))),
          if (store?['id'] != null)
            IconButton(
                tooltip: 'Packing and busy mode',
                icon: const Icon(Icons.schedule),
                onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => PreparationSettingsScreen(
                        vendorId: '${store!['id']}', api: api))))
        ]),
        body: Center(
            child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 620),
                child: SingleChildScrollView(
                    padding: const EdgeInsets.all(20),
                    child: Form(
                        key: form,
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              if (busy) const LinearProgressIndicator(),
                              if (error != null) ...[
                                Text(error!,
                                    key: const ValueKey('store-profile-error')),
                                if (store == null)
                                  TextButton(
                                      onPressed: busy ? null : load,
                                      child: const Text('Try again'))
                              ],
                              if (store != null) ...[
                                Text(
                                    '${store!['city']?['name'] ?? 'City pending'} · ${store!['city']?['state'] ?? ''} · ${store!['pinCode'] ?? 'PIN pending'}'),
                                const SizedBox(height: 16),
                                TextFormField(
                                    controller: name,
                                    enabled: !busy,
                                    maxLength: 60,
                                    decoration: const InputDecoration(
                                        labelText: 'Store name'),
                                    validator: (v) =>
                                        (v?.trim().length ?? 0) < 2
                                            ? 'Enter a store name.'
                                            : null),
                                TextFormField(
                                    controller: address,
                                    enabled: !busy,
                                    maxLength: 140,
                                    maxLines: 3,
                                    decoration: const InputDecoration(
                                        labelText: 'Pickup address'),
                                    validator: (v) =>
                                        (v?.trim().length ?? 0) < 3
                                            ? 'Enter a pickup address.'
                                            : null),
                                TextFormField(
                                    controller: banner,
                                    enabled: !busy,
                                    maxLength: 500,
                                    decoration: const InputDecoration(
                                        labelText:
                                            'Banner image URL (optional)'),
                                    validator: (v) {
                                      if (v == null || v.trim().isEmpty) {
                                        return null;
                                      }
                                      final u = Uri.tryParse(v.trim());
                                      return u?.scheme == 'https' &&
                                              u!.host.isNotEmpty &&
                                              u.userInfo.isEmpty
                                          ? null
                                          : 'Use an HTTPS image URL.';
                                    }),
                                const Text(
                                    'Operations manages your registered city, PIN, operating hours and service area. Use the location control to submit a new GPS pin.'),
                                const SizedBox(height: 16),
                                FilledButton(
                                    onPressed: busy ? null : save,
                                    child: const Text('Save store profile')),
                                if (saved != null)
                                  Padding(
                                      padding: const EdgeInsets.only(top: 16),
                                      child: Text(saved!,
                                          key: const ValueKey(
                                              'store-profile-saved'))),
                              ],
                            ]))))),
      );
}
