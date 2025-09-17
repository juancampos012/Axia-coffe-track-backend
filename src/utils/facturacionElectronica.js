const { create } = require('xmlbuilder2');

/**
 * Generar XML básico de una factura electrónica (estructura tipo DIAN)
 * @param {Object} data
 * @returns {string} XML en formato string
 */
function generarXMLFactura({ tenant, client, invoice, products }) {
    const doc = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('Invoice', { xmlns: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2' })
        .ele('cbc:ID').txt(invoice.id).up()
        .ele('cbc:IssueDate').txt(invoice.date.toISOString().split('T')[0]).up()
        .ele('cbc:InvoiceTypeCode').txt('01').up() // 01 = Factura de venta
  
        // Datos del emisor
        .ele('cac:AccountingSupplierParty')
          .ele('cbc:CustomerAssignedAccountID').txt(tenant.nit).up()
          .ele('cbc:AdditionalAccountID').txt('1').up() // 1 = Persona Jurídica
          .ele('cac:Party')
            .ele('cac:PartyName').ele('cbc:Name').txt(tenant.name).up().up()
            .ele('cac:PhysicalLocation')
              .ele('cbc:AddressLine').ele('cbc:Line').txt(tenant.address).up().up().up()
            .ele('cac:Contact')
              .ele('cbc:Telephone').txt(tenant.phone).up()
            .up()
          .up()
        .up()
  
        // Datos del cliente
        .ele('cac:AccountingCustomerParty')
          .ele('cbc:CustomerAssignedAccountID').txt(client.identification).up()
          .ele('cbc:AdditionalAccountID').txt('1').up()
          .ele('cac:Party')
            .ele('cac:PartyName').ele('cbc:Name').txt(`${client.firstName} ${client.lastName}`).up().up()
          .up()
        .up()
  
        // Líneas de factura
        .ele('cac:InvoiceLineList');
  
    products.forEach((productLine, index) => {
      doc
        .ele('cac:InvoiceLine')
          .ele('cbc:ID').txt(index + 1).up()
          .ele('cbc:InvoicedQuantity').txt(productLine.quantity).up()
          .ele('cbc:LineExtensionAmount').txt((productLine.product.salePrice * productLine.quantity).toFixed(2)).up()
          .ele('cac:Item')
            .ele('cbc:Description').txt(productLine.product.name).up()
          .up()
          .ele('cac:Price')
            .ele('cbc:PriceAmount').txt(productLine.product.salePrice.toFixed(2)).up()
          .up()
        .up();
    });
  
    doc.up(); 
  
    doc
      .ele('cac:LegalMonetaryTotal')
        .ele('cbc:PayableAmount').txt(invoice.totalPrice.toFixed(2)).up()
      .up();
  
    return doc.end({ prettyPrint: true });
}

module.exports = { generarXMLFactura };