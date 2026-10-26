import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kraveo_ui/kraveo_ui.dart';

void main() {
  testWidgets(
      'support submits an order-linked request and opens the private reply thread at 360px',
      (tester) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 1.3;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
      tester.platformDispatcher.clearTextScaleFactorTestValue();
    });
    final cases = <Map<String, dynamic>>[];
    final messages = <Map<String, dynamic>>[];
    final posted = <Map<String, dynamic>>[];
    Future<Map<String, dynamic>> call(String method, String path,
        [Map<String, dynamic>? data]) async {
      if (method == 'POST' && path == '/v1/support-cases') {
        posted.add(data!);
        cases.add({
          'id': 'case-one',
          'subject': data['subject'],
          'description': data['description'],
          'status': 'OPEN'
        });
        return {'success': true};
      }
      if (method == 'POST') {
        messages.insert(0, {
          'id': 'reply-one',
          'message': data!['message'],
          'fromSupport': false
        });
        return {'success': true};
      }
      if (path.startsWith('/v1/support-cases/case-one')) {
        return {
          'data': {...cases.single, 'notes': messages, 'nextNotesCursor': null}
        };
      }
      return {'data': cases, 'nextCursor': null};
    }

    await tester.pumpWidget(
        MaterialApp(home: SupportCenter(call: call, orderId: 'order-owned')));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Damaged item').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField),
        'One pack was damaged. Please review a refund.');
    await tester.tap(find.text('Send request'));
    await tester.pumpAndSettle();
    expect(posted.single['orderId'], 'order-owned');
    expect(posted.single['description'], contains('damaged'));
    expect(posted.single['category'], 'DAMAGED_ITEM');
    await tester.ensureVisible(find.text('Damaged item').last);
    await tester.tap(find.text('Damaged item').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'The seal was broken.');
    await tester.ensureVisible(find.text('Send reply'));
    await tester.tap(find.text('Send reply'));
    await tester.pumpAndSettle();
    expect(find.text('The seal was broken.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
