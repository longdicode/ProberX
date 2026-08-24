import 'package:flutter_test/flutter_test.dart';

import 'package:proberx_desktop/main.dart';

void main() {
  testWidgets('app builds smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const ProberXApp());
    expect(find.byType(ProberXApp), findsOneWidget);
  });
}
