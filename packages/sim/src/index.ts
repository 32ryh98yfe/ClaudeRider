import { HELLO, type Foo } from '@cr/content';
import { twice } from './util.ts';
export const SIM: string = HELLO + ':' + twice(2);
export type Bar = Foo;
