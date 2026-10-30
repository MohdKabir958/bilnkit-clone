import 'package:flutter/material.dart';
import '../services/product_api.dart';

/// Read-only owned-store reports. Values are computed by the backend, never from local orders.
class StorePerformanceScreen extends StatefulWidget {
  const StorePerformanceScreen({super.key, required this.vendorId, this.api});
  final String vendorId;
  final ProductApi? api;
  @override
  State<StorePerformanceScreen> createState() => _StorePerformanceScreenState();
}

class _StorePerformanceScreenState extends State<StorePerformanceScreen> {
  late final api = widget.api ?? ProductApi();
  Map<String, dynamic>? data;
  String? error;
  bool loading = true;
  int days = 30;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final response = await api.call('GET',
          '/v1/partner/stores/${Uri.encodeComponent(widget.vendorId)}/performance?days=$days');
      if (mounted) {
        setState(() => data = Map<String, dynamic>.from(response['data']));
      }
    } catch (e) {
      if (mounted) {
        setState(() => error = '$e');
      }
    }
    if (mounted) {
      setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Store performance')),
        body: RefreshIndicator(
            onRefresh: load,
            child: ListView(padding: const EdgeInsets.all(20), children: [
              DropdownButtonFormField<int>(
                  initialValue: days,
                  decoration: const InputDecoration(labelText: 'Report period'),
                  items: [
                    for (final n in [7, 30, 90])
                      DropdownMenuItem(value: n, child: Text('Last $n days'))
                  ],
                  onChanged: loading
                      ? null
                      : (v) {
                          days = v ?? 30;
                          load();
                        }),
              if (loading)
                const Padding(
                    padding: EdgeInsets.all(24),
                    child: Center(child: CircularProgressIndicator())),
              if (error != null) ...[
                Text(error!,
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error)),
                OutlinedButton(
                    onPressed: loading ? null : load,
                    child: const Text('Retry report'))
              ],
              if (data != null && !loading) ...[
                const SizedBox(height: 20),
                Text('Order preparation',
                    style: Theme.of(context).textTheme.titleLarge),
                ListTile(
                    title: const Text('Orders received'),
                    trailing: Text('${data!['orders']}')),
                ListTile(
                    title: const Text('Delivered'),
                    trailing: Text('${data!['delivered']}')),
                ListTile(
                    title: const Text('Cancelled'),
                    trailing: Text('${data!['cancelled']}')),
                ListTile(
                    title: const Text('Average packing time'),
                    subtitle: const Text(
                        'Accepted to marked ready; only completed preparation intervals.'),
                    trailing: Text(data!['averagePackingMinutes'] is num
                        ? '${(data!['averagePackingMinutes'] as num).toStringAsFixed(1)} min'
                        : 'No data')),
                const Divider(),
                Text('Stock and shortage reports',
                    style: Theme.of(context).textTheme.titleLarge),
                const Text(
                    'Counts show recorded stock events, not pack quantities or refund amounts.'),
                if ((data!['stockEvents'] as List).isEmpty)
                  const ListTile(
                      title: Text('No stock issues recorded in this period.')),
                for (final event in data!['stockEvents'])
                  ListTile(
                      title: Text('${event['kind']}'.replaceAll('_', ' ')),
                      trailing: Text('${event['events']} events')),
                const Divider(),
                Text('Low-stock alerts',
                    style: Theme.of(context).textTheme.titleLarge),
                const Text(
                    'Up to 20 products at or below their configured threshold. Open inventory to replenish them.'),
                if ((data!['lowStock'] as List).isEmpty)
                  const ListTile(title: Text('No low-stock products.')),
                for (final item in data!['lowStock'])
                  ListTile(
                      leading: const Icon(Icons.inventory_2_outlined),
                      title: Text('${item['name']}'),
                      subtitle: Text(
                          'Alert threshold: ${item['lowStockThreshold']} packs'),
                      trailing: Text('${item['stockQty']} left')),
              ],
            ])),
      );
}
