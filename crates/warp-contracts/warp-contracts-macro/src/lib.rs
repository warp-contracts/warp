use proc_macro::TokenStream;

mod warp_contract_macro;

#[proc_macro_attribute]
pub fn warp_contract(attr: TokenStream, input: TokenStream) -> TokenStream {
    warp_contract_macro::warp_contract(attr, input)
}
