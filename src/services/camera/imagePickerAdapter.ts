import * as ImagePicker from 'expo-image-picker';
import { CameraCaptureCancelledError, type NativeCameraAdapter } from './CameraService';

export function createImagePickerCameraAdapter(): NativeCameraAdapter {
  return {
    async capture() {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        throw new Error('camera-permission-denied');
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        allowsMultipleSelection: false,
        quality: 0.85,
      });

      if (result.canceled) {
        throw new CameraCaptureCancelledError();
      }

      const asset = result.assets?.[0];
      if (!asset?.uri) {
        throw new Error('camera-no-asset');
      }

      return { uri: asset.uri };
    },

    async pickFromLibrary(options) {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('library-permission-denied');
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        allowsMultipleSelection: options?.multiple ?? false,
        quality: 0.85,
      });

      if (result.canceled) {
        throw new CameraCaptureCancelledError();
      }

      const uris = result.assets?.map(asset => asset.uri).filter(Boolean) ?? [];
      if (uris.length === 0) {
        throw new Error('library-no-asset');
      }

      return { uris };
    },
  };
}




