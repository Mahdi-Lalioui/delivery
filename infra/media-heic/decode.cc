#include <libheif/heif.h>
#include <libheif/heif_items.h>

#include <algorithm>
#include <cerrno>
#include <csignal>
#include <cstdint>
#include <cstdio>
#include <fcntl.h>
#include <map>
#include <memory>
#include <sys/resource.h>
#include <sys/stat.h>
#include <unistd.h>
#include <vector>

namespace {

constexpr size_t kMiB = 1024 * 1024;
constexpr size_t kMaxInput = 8 * kMiB;
constexpr uint64_t kMaxPixels = 24 * kMiB;
constexpr uint32_t kMaxItems = 256;
constexpr int kRejected = 1;
constexpr int kFailure = 2;

bool lower_limit(int resource, rlim_t maximum) {
  rlimit limit{};
  if (getrlimit(resource, &limit) != 0) return false;
  if (limit.rlim_cur <= maximum) return true;
  limit.rlim_cur = maximum;
  return setrlimit(resource, &limit) == 0;
}

int read_input(const char* path, std::vector<uint8_t>& bytes) {
  const int fd = open(path, O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC);
  if (fd < 0) return kFailure;
  auto close_file = [](FILE* stream) { fclose(stream); };
  auto file = std::unique_ptr<FILE, decltype(close_file)>(fdopen(fd, "rb"), close_file);
  if (!file) {
    close(fd);
    return kFailure;
  }
  struct stat metadata{};
  if (fstat(fd, &metadata) != 0 || !S_ISREG(metadata.st_mode)) return kFailure;
  if (metadata.st_size <= 0 || static_cast<uint64_t>(metadata.st_size) > kMaxInput) {
    return kRejected;
  }
  bytes.resize(static_cast<size_t>(metadata.st_size));
  if (fread(bytes.data(), 1, bytes.size(), file.get()) != bytes.size() ||
      fgetc(file.get()) != EOF || ferror(file.get())) {
    return kFailure;
  }
  return 0;
}

bool fits(int width, int height) {
  return width > 0 && height > 0 && static_cast<uint64_t>(width) * height <= kMaxPixels;
}

bool is_hevc_image(const heif_context* context, heif_item_id id,
                   std::map<heif_item_id, bool>& checked) {
  auto [entry, first_visit] = checked.try_emplace(id, false);
  if (!first_visit) return entry->second;
  const uint32_t type = heif_item_get_item_type(context, id);
  if (type == heif_item_type_hvc1) return entry->second = true;
  if (type != heif_item_type_grid && type != heif_fourcc('i', 'd', 'e', 'n') &&
      type != heif_fourcc('i', 'o', 'v', 'l')) {
    return false;
  }

  // A derived primary must resolve to HEVC images, including every grid tile.
  for (int index = 0; ; ++index) {
    uint32_t reference_type = 0;
    heif_item_id* sources = nullptr;
    const size_t count =
        heif_context_get_item_references(context, id, index, &reference_type, &sources);
    const bool is_derived_from = count > 0 && reference_type == heif_fourcc('d', 'i', 'm', 'g');
    const bool valid = is_derived_from &&
        std::all_of(sources, sources + count, [&](heif_item_id source) {
          return is_hevc_image(context, source, checked);
        });
    heif_release_item_references(context, &sources);
    if (count == 0) return entry->second;
    if (is_derived_from && !valid) return entry->second = false;
    if (valid) entry->second = true;
  }
}

int decode_error(heif_error error) {
  if (error.subcode == heif_suberror_Security_limit_exceeded) return kRejected;
  // The libde265 bridge can report a failed allocation as a missing decoded frame.
  if (errno == ENOMEM) return kFailure;
  switch (error.code) {
    case heif_error_Invalid_input:
    case heif_error_Unsupported_filetype:
    case heif_error_Unsupported_feature:
    case heif_error_Decoder_plugin_error:
      return kRejected;
    default:
      return kFailure;
  }
}

int write_rgba(const heif_image* image) {
  const int width = heif_image_get_width(image, heif_channel_interleaved);
  const int height = heif_image_get_height(image, heif_channel_interleaved);
  if (!fits(width, height)) return kRejected;
  const size_t row_bytes = static_cast<size_t>(width) * 4;
  size_t stride = 0;
  const uint8_t* pixels = heif_image_get_plane_readonly2(image, heif_channel_interleaved, &stride);
  if (!pixels || stride < row_bytes || stride > SIZE_MAX / static_cast<size_t>(height) ||
      heif_image_get_bits_per_pixel(image, heif_channel_interleaved) != 32) {
    return kFailure;
  }
  uint8_t header[8];
  for (int byte = 0; byte < 4; ++byte) {
    header[byte] = static_cast<uint8_t>(width >> (byte * 8));
    header[4 + byte] = static_cast<uint8_t>(height >> (byte * 8));
  }
  if (fwrite(header, 1, sizeof(header), stdout) != sizeof(header)) return kFailure;
  for (int row = 0; row < height; ++row) {
    if (fwrite(pixels + stride * row, 1, row_bytes, stdout) != row_bytes) return kFailure;
  }
  return fflush(stdout) == 0 ? 0 : kFailure;
}

int decode(const std::vector<uint8_t>& bytes) {
  auto context = std::unique_ptr<heif_context, decltype(&heif_context_free)>(
      heif_context_alloc(), heif_context_free);
  if (!context || !heif_have_decoder_for_format(heif_compression_HEVC)) return kFailure;
  auto* limits = heif_context_get_security_limits(context.get());
  limits->max_image_size_pixels = kMaxPixels;
  limits->max_total_memory = 256 * kMiB;
  limits->max_number_of_tiles = kMaxItems;
  limits->max_items = kMaxItems;
  heif_context_set_max_decoding_threads(context.get(), 0);

  errno = 0;
  heif_error error =
      heif_context_read_from_memory_without_copy(context.get(), bytes.data(), bytes.size(), nullptr);
  if (error.code != heif_error_Ok) return decode_error(error);
  heif_image_handle* primary = nullptr;
  errno = 0;
  error = heif_context_get_primary_image_handle(context.get(), &primary);
  if (error.code != heif_error_Ok) return decode_error(error);
  auto handle = std::unique_ptr<heif_image_handle, decltype(&heif_image_handle_release)>(
      primary, heif_image_handle_release);
  if (!fits(heif_image_handle_get_width(primary), heif_image_handle_get_height(primary))) {
    return kRejected;
  }
  std::map<heif_item_id, bool> checked;
  if (!is_hevc_image(context.get(), heif_image_handle_get_item_id(primary), checked)) {
    return kRejected;
  }

  auto options = std::unique_ptr<heif_decoding_options, decltype(&heif_decoding_options_free)>(
      heif_decoding_options_alloc(), heif_decoding_options_free);
  if (!options) return kFailure;
  options->strict_decoding = 1;
  options->convert_hdr_to_8bit = 1;
  options->decoder_id = "libde265";
  options->num_codec_threads = 1;
  heif_image* decoded = nullptr;
  errno = 0;
  error = heif_decode_image(
      primary, &decoded, heif_colorspace_RGB, heif_chroma_interleaved_RGBA, options.get());
  if (error.code != heif_error_Ok) return decode_error(error);
  auto image = std::unique_ptr<heif_image, decltype(&heif_image_release)>(decoded, heif_image_release);
  return image ? write_rgba(image.get()) : kFailure;
}

}  // namespace

int main(int argc, char* argv[]) {
  if (argc != 2 || argv[1][0] != '/') return kFailure;
  if (!lower_limit(RLIMIT_AS, 512 * kMiB) || !lower_limit(RLIMIT_CPU, 8) ||
      !lower_limit(RLIMIT_CORE, 0) || signal(SIGPIPE, SIG_IGN) == SIG_ERR) {
    return kFailure;
  }
  alarm(10);
  try {
    std::vector<uint8_t> bytes;
    const int result = read_input(argv[1], bytes);
    return result == 0 ? decode(bytes) : result;
  } catch (...) {
    return kFailure;
  }
}
