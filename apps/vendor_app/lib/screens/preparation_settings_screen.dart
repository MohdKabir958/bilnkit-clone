import 'package:flutter/material.dart';
import '../services/product_api.dart';

/// Server-owned store packing policy. Pauses affect new checkout, never existing order access.
class PreparationSettingsScreen extends StatefulWidget {
  const PreparationSettingsScreen(
      {super.key, required this.vendorId, this.api});
  final String vendorId;
  final ProductApi? api;
  @override
  State<PreparationSettingsScreen> createState() =>
      _PreparationSettingsScreenState();
}

class _PreparationSettingsScreenState extends State<PreparationSettingsScreen> {
  late final ProductApi api = widget.api ?? ProductApi();
  final form = GlobalKey<FormState>();
  final minutes = TextEditingController(text: '10');
  final capacity = TextEditingController(text: '10');
  int busyFor = 0;
  bool loading = true, saving = false;
  String? error, message;
  DateTime? busyUntil;
  bool scheduled = false;
  final hours = <int, Map<String, int>>{};
  static const days = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday'
  ];
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    minutes.dispose();
    capacity.dispose();
    super.dispose();
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final result = await api.call('GET',
          '/v1/partner/stores/${Uri.encodeComponent(widget.vendorId)}/preparation');
      final data = result['data'] as Map;
      if (!mounted) return;
      setState(() {
        minutes.text = '${data['preparationMinutes']}';
        capacity.text = '${data['maxPreparingOrders']}';
        busyUntil = DateTime.tryParse('${data['busyUntil']}');
        scheduled = data['operatingHours'] is List;
        hours.clear();
        for (final entry in (data['operatingHours'] as List? ?? [])) {
          hours[entry['day'] as int] = {
            'opens': entry['opens'] as int,
            'closes': entry['closes'] as int
          };
        }
      });
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
    if (mounted) setState(() => loading = false);
  }

  Future<void> save() async {
    if (saving || !form.currentState!.validate()) return;
    setState(() {
      saving = true;
      error = null;
      message = null;
    });
    try {
      await api.call(
          'PUT',
          '/v1/partner/stores/${Uri.encodeComponent(widget.vendorId)}/preparation',
          {
            'preparationMinutes': int.parse(minutes.text),
            'maxPreparingOrders': int.parse(capacity.text),
            'busyForMinutes': busyFor,
            'operatingHours': scheduled
                ? [
                    for (final day in hours.keys.toList()..sort())
                      {'day': day, ...hours[day]!}
                  ]
                : null,
          });
      if (!mounted) return;
      setState(() => message =
          'Packing policy saved. Existing orders still need your attention.');
      await load();
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
    if (mounted) setState(() => saving = false);
  }

  String? check(String? value, int max) {
    final n = int.tryParse(value ?? '');
    return n == null || n < 1 || n > max
        ? 'Enter a number from 1 to $max.'
        : null;
  }

  String clock(int value) =>
      '${(value ~/ 60).toString().padLeft(2, '0')}:${(value % 60).toString().padLeft(2, '0')}';
  Future<void> chooseTime(int day, String field) async {
    final value = hours[day]![field]!.clamp(0, 1439);
    final chosen = await showTimePicker(
        context: context,
        initialTime: TimeOfDay(hour: value ~/ 60, minute: value % 60));
    if (chosen != null && mounted) {
      setState(() => hours[day]![field] = chosen.hour * 60 + chosen.minute);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('Packing and busy mode')),
      body: Center(
          child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 620),
              child: loading
                  ? const Center(child: CircularProgressIndicator())
                  : SingleChildScrollView(
                      padding: const EdgeInsets.all(20),
                      child: Form(
                          key: form,
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Text('Keep your pickup estimates realistic',
                                    style:
                                        Theme.of(context).textTheme.titleLarge),
                                const SizedBox(height: 12),
                                const Text(
                                    'New orders use these estimates to time rider matching. You can choose an order-specific packing time when accepting it.'),
                                const SizedBox(height: 20),
                                TextFormField(
                                    controller: minutes,
                                    keyboardType: TextInputType.number,
                                    decoration: const InputDecoration(
                                        labelText:
                                            'Typical packing time (minutes)'),
                                    validator: (v) => check(v, 120)),
                                const SizedBox(height: 16),
                                TextFormField(
                                    controller: capacity,
                                    keyboardType: TextInputType.number,
                                    decoration: const InputDecoration(
                                        labelText:
                                            'Maximum orders being packed'),
                                    validator: (v) => check(v, 100)),
                                const SizedBox(height: 16),
                                DropdownButtonFormField<int>(
                                    initialValue: busyFor,
                                    decoration: const InputDecoration(
                                        labelText: 'Pause new checkout'),
                                    items: const [
                                      DropdownMenuItem(
                                          value: 0,
                                          child:
                                              Text('Available for new orders')),
                                      DropdownMenuItem(
                                          value: 15,
                                          child: Text('Busy for 15 minutes')),
                                      DropdownMenuItem(
                                          value: 30,
                                          child: Text('Busy for 30 minutes')),
                                      DropdownMenuItem(
                                          value: 60,
                                          child: Text('Busy for 1 hour')),
                                      DropdownMenuItem(
                                          value: 120,
                                          child: Text('Busy for 2 hours'))
                                    ],
                                    onChanged: saving
                                        ? null
                                        : (v) =>
                                            setState(() => busyFor = v ?? 0)),
                                if (busyUntil != null &&
                                    busyUntil!.isAfter(DateTime.now()))
                                  Padding(
                                      padding: const EdgeInsets.only(top: 12),
                                      child: Text(
                                          'Currently busy until ${TimeOfDay.fromDateTime(busyUntil!.toLocal()).format(context)}.')),
                                if (error != null)
                                  Padding(
                                      padding: const EdgeInsets.symmetric(
                                          vertical: 12),
                                      child: Text(error!,
                                          style: TextStyle(
                                              color: Theme.of(context)
                                                  .colorScheme
                                                  .error))),
                                if (message != null)
                                  Padding(
                                      padding: const EdgeInsets.symmetric(
                                          vertical: 12),
                                      child: Text(message!)),
                                const SizedBox(height: 20),
                                SwitchListTile.adaptive(
                                  contentPadding: EdgeInsets.zero,
                                  title: const Text('Weekly opening hours'),
                                  subtitle: const Text(
                                      'Times use India Standard Time. Closed days cannot receive new checkout. Turning this off uses your manual open/close switch.'),
                                  value: scheduled,
                                  onChanged: saving
                                      ? null
                                      : (value) =>
                                          setState(() => scheduled = value),
                                ),
                                if (scheduled) ...[
                                  const Text(
                                      'Enable each open day. A closing time before opening means overnight opening.'),
                                  for (var day = 0; day < 7; day++)
                                    Column(children: [
                                      CheckboxListTile(
                                        contentPadding: EdgeInsets.zero,
                                        title: Text(days[day]),
                                        value: hours.containsKey(day),
                                        onChanged: saving
                                            ? null
                                            : (enabled) => setState(() {
                                                  if (enabled == true) {
                                                    hours[day] = {
                                                      'opens': 480,
                                                      'closes': 1260
                                                    };
                                                  } else {
                                                    hours.remove(day);
                                                  }
                                                }),
                                      ),
                                      if (hours.containsKey(day))
                                        Wrap(spacing: 12, children: [
                                          OutlinedButton(
                                              onPressed: saving
                                                  ? null
                                                  : () =>
                                                      chooseTime(day, 'opens'),
                                              child: Text(
                                                  'Opens ${clock(hours[day]!['opens']!)}')),
                                          OutlinedButton(
                                              onPressed: saving
                                                  ? null
                                                  : () =>
                                                      chooseTime(day, 'closes'),
                                              child: Text(
                                                  'Closes ${clock(hours[day]!['closes']!)}')),
                                        ]),
                                    ]),
                                ],
                                const SizedBox(height: 20),
                                FilledButton(
                                    onPressed: saving ? null : save,
                                    child: Text(saving
                                        ? 'Saving…'
                                        : 'Save packing policy')),
                              ]))))));
}
