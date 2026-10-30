import 'package:customer_app/services/push/push_payload.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
      'support updates carry only validated case references, not a fabricated order',
      () {
    final data = <String, dynamic>{
      'event': 'SUPPORT_UPDATED',
      'orderId': '',
      'caseId': 'case-one',
      'noteId': 'note-one',
      'v': '1'
    };
    final parsed = PushPayload.tryParse(data);
    expect(parsed, isNotNull);
    expect(parsed!.event, PushEvent.supportUpdated);
    expect(parsed.caseId, 'case-one');
    expect(parsed.noteId, 'note-one');
    expect(PushPayload.tryDecode(parsed.encode())!.caseId, 'case-one');
    for (final value in [
      {...data, 'caseId': ''},
      {...data, 'caseId': '../other'},
      {...data, 'noteId': 42},
      {...data, 'v': '2'},
      {...data}..remove('noteId')
    ]) {
      expect(PushPayload.tryParse(value), isNull);
    }
  });
}
