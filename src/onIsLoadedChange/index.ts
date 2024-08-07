import type { AnyAsyncState } from '../types';
import { RootKey } from '../utils/constants';
import createOnValueOfChange from '../utils/createOnValueOfChange';

const onIsLoadedChange = createOnValueOfChange(
  RootKey.IS_LOADED_CALLBACK_SET
) as {
  (state: AnyAsyncState, cb: (isLoaded: boolean) => void): () => void;
};

export default onIsLoadedChange;
