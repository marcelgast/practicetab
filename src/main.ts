import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { useAppStore } from './stores/app';
import { usePracticeStore } from './stores/practice';
import { useLibraryStore } from './stores/library';
import './styles/app.css';

document.documentElement.setAttribute('data-locked', 'true');

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

const appStore = useAppStore(pinia);
router.afterEach((to) => {
  appStore.setLastOpenedRoute(to.fullPath);
});

void appStore.refreshOutputDevicesBasic();
// Mirror the output-device sync for input devices so the stored
// audioInputDeviceId preference is pushed to Rust on every startup.
// Without this the InputEngine stays at `selected_device_id: None`
// until the user opens Settings, and the first feedback run after
// launch runs against the OS default mic instead of whatever device
// they picked last session. Same helper, same syncInputDevice path
// that validates the stored id against the live device list and
// clamps the saved channel if the device has fewer inputs now.
void appStore.refreshInputDevicesBasic();

const practiceStore = usePracticeStore(pinia);
practiceStore.init().catch((error) => {
  void error;
  appStore.setLastError(`Practice init failed: ${String(error)}`);
});

const libraryStore = useLibraryStore(pinia);
try {
  libraryStore.init();
} catch (error) {
  void error;
  appStore.setLastError(`Library init failed: ${String(error)}`);
}

app.mount('#app');
