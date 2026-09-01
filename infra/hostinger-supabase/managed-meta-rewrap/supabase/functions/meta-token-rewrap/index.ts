import { handleMetaTokenRewrap } from './core.ts';

Deno.serve((request) =>
  handleMetaTokenRewrap(request, (name) => Deno.env.get(name))
);
