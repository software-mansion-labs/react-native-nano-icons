cmake_minimum_required(VERSION 3.13)
set(CMAKE_VERBOSE_MAKEFILE on)

set(LIB_ANDROID_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../..)
set(LIB_COMMON_DIR ${LIB_ANDROID_DIR}/../common/cpp)
set(LIB_COMMON_COMPONENTS_DIR ${LIB_COMMON_DIR}/react/renderer/components/RNNanoIconsSpec)
set(LIB_GENERATED_JNI_DIR ${LIB_ANDROID_DIR}/build/generated/source/codegen/jni)
set(LIB_GENERATED_COMPONENTS_DIR ${LIB_GENERATED_JNI_DIR}/react/renderer/components/RNNanoIconsSpec)

file(GLOB react_codegen_SRCS CONFIGURE_DEPENDS
  ${LIB_GENERATED_JNI_DIR}/*.cpp
  ${LIB_GENERATED_COMPONENTS_DIR}/*.cpp
  ${LIB_COMMON_COMPONENTS_DIR}/*.cpp
)

add_library(
  react_codegen_RNNanoIconsSpec
  OBJECT
  ${react_codegen_SRCS}
)

target_include_directories(
  react_codegen_RNNanoIconsSpec
  PUBLIC
  .
  ${LIB_COMMON_DIR}
  ${LIB_GENERATED_JNI_DIR}
  ${LIB_GENERATED_COMPONENTS_DIR}
)

target_link_libraries(
  react_codegen_RNNanoIconsSpec
  fbjni
  jsi
  reactnative
)

target_compile_reactnative_options(react_codegen_RNNanoIconsSpec PRIVATE)
