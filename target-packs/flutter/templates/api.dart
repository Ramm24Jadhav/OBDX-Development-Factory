/*
 * <<Module>> services of OBDX, used by the <<module>> screens. Paths and field names as in the bank's OBDX REST services.
 */
import 'client.dart';

/// <<What is sent>>.
class <<Name>>Request {
  const <<Name>>Request({required this.<<field>>});

  final String <<field>>;

  Map<String, Object?> toJson() => {'<<field>>': <<field>>};
}

/// <<What comes back>>.
class <<Name>>Response {
  const <<Name>>Response({required this.<<field>>});

  final String <<field>>;

  factory <<Name>>Response.fromJson(Map<String, Object?> json) => <<Name>>Response(<<field>>: json['<<field>>']! as String);
}

/// <<What the call does>>: <<METHOD and path of the OBDX service>>.
Future<<<Name>>Response> <<name>>(<<Name>>Request request) async {
  final data = await api.post('<<path>>', request.toJson());
  return <<Name>>Response.fromJson(data! as Map<String, Object?>);
}
