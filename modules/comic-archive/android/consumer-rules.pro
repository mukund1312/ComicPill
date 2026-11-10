# ONNX Runtime's native library looks its Java classes up by name, so the release minifier must not rename or remove them.
-keep class ai.onnxruntime.** { *; }
-keepclassmembers class ai.onnxruntime.** { *; }
-dontwarn ai.onnxruntime.**
