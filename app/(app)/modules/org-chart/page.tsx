import type { CSSProperties } from "react";
import styles from "./org-chart.module.css";

function dcolor(varName: string): CSSProperties {
  return { "--dcolor": `var(${varName})` } as CSSProperties;
}

export default function OrgChartPage() {
  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <header className={styles.header}>
          <div className={styles.eyebrow}>Corporate Structure</div>
          <h1>SHANTAHL DIRECT SALES INC.</h1>
          <p>Organization Chart</p>
        </header>

        {/* Governance */}
        <div className={styles.gov}>
          <div className={`${styles.node} ${styles.board}`}>
            <div className={styles.role}>Governing Body</div>
            <div className={styles.name}>Board of Directors</div>
          </div>
          <div className={styles.vline} />
        </div>

        <div className={styles.halves}>
          <div className={styles.half}>
            <div className={styles.node}>
              <div className={styles.role}>Chairman of the Board</div>
              <div className={styles.name}>Lowel B. Magdadaro</div>
            </div>
          </div>
          <div className={styles.half}>
            <div className={styles.node}>
              <div className={styles.role}>Vice Chairperson</div>
              <div className={styles.name}>Sheilah A. Magdadaro</div>
            </div>
          </div>
        </div>

        {/* ===================== BUSINESS UNITS ===================== */}
        <div className={styles.unitLabel}>Business Units — under the Chairman of the Board</div>

        {/* Shantahl Main */}
        <div className={styles.dept} style={dcolor("--main")}>
          <div className={styles.deptHead}>
            <h2>1. Shantahl Main Department</h2>
            <span className={styles.headName}>Lowel B. Magdadaro</span>
            <span className={styles.headTitle}>— Head / Chairman</span>
          </div>
          <ul className={`${styles.tree} ${styles.root}`}>
            <li>
              <div className={styles.division}>Marketing Division</div>
              <ul className={styles.tree}>
                <li>
                  <span className={styles.person}>Jasmine Eusebio</span> <span className={styles.title}>— Social Media Manager</span>
                  <ul className={styles.tree}>
                    <li>
                      <span className={styles.person}>Renz Nunez</span> <span className={styles.title}>— Social Media Manager</span>
                    </li>
                  </ul>
                </li>
                <li>
                  <span className={styles.person}>John Paul Michael Papa</span> <span className={styles.title}>— Multimedia Artist Head</span>
                  <ul className={styles.tree}>
                    <li>
                      <span className={styles.person}>Michael De Maliwat</span> <span className={styles.title}>— Multimedia Artist</span>
                    </li>
                    <li>
                      <span className={styles.person}>Danielle Borja</span> <span className={styles.title}>— Video Editor</span>
                    </li>
                  </ul>
                </li>
              </ul>
            </li>
            <li>
              <div className={styles.division}>Network Development Division</div>
              <ul className={styles.tree}>
                <li>
                  <span className={styles.person}>Chester Rosales</span> <span className={styles.title}>— Network Development Manager, Luzon</span>
                </li>
                <li>
                  <span className={styles.person}>Randel Segovia</span> <span className={styles.title}>— Network Development Manager, Luzon</span>
                </li>
                <li>
                  <span className={styles.person}>Romelito Domecillo</span> <span className={styles.title}>— Network Development Manager, Luzon</span>
                </li>
              </ul>
            </li>
            <li>
              <div className={styles.division}>Sales Division</div>
              <ul className={styles.tree}>
                <li>
                  <span className={styles.placeholder}>Ads Specialist</span>
                </li>
                <li>
                  <span className={styles.placeholder}>Sales Admins</span>
                </li>
              </ul>
            </li>
          </ul>
        </div>

        {/* Shantahl Cosmetics */}
        <div className={styles.dept} style={dcolor("--cosmetics")}>
          <div className={styles.deptHead}>
            <h2>2. Shantahl Cosmetics Department</h2>
            <span className={styles.headName}>Junrey M. Japitan</span>
            <span className={styles.headTitle}>— Head / President</span>
          </div>
          <ul className={`${styles.tree} ${styles.root}`}>
            <li>
              <div className={styles.division}>Marketing Division</div>
              <ul className={styles.tree}>
                <li>
                  <span className={styles.person}>Loribel Garcia</span> <span className={styles.title}>— Multimedia Artist Head</span>
                  <ul className={styles.tree}>
                    <li>
                      <span className={styles.person}>Arnie Pangilinan</span> <span className={styles.title}>— Video Editor</span>
                    </li>
                  </ul>
                </li>
              </ul>
            </li>
            <li>
              <div className={styles.division}>Sales Division</div>
              <ul className={styles.tree}>
                <li>
                  <span className={styles.person}>Jerome Canas</span> <span className={styles.title}>— Platform Specialist</span>
                </li>
              </ul>
            </li>
          </ul>
        </div>

        {/* Darofy */}
        <div className={styles.dept} style={dcolor("--darofy")}>
          <div className={styles.deptHead}>
            <h2>3. Darofy Department</h2>
            <span className={styles.headName}>Mark Anthony M. Magdadaro</span>
            <span className={styles.headTitle}>— Head / President</span>
          </div>
          <ul className={`${styles.tree} ${styles.root}`}>
            <li>
              <div className={styles.division}>Marketing Division</div>
              <ul className={styles.tree}>
                <li>
                  <span className={styles.person}>Sarah Mei Iglesia</span> <span className={styles.title}>— Marketing Head</span>
                  <ul className={styles.tree}>
                    <li>
                      <span className={styles.person}>Erwin Carreon</span> <span className={styles.title}>— Content Creator</span>
                    </li>
                    <li>
                      <span className={styles.person}>Angela Acosta</span> <span className={styles.title}>— Content Creator</span>
                    </li>
                    <li>
                      <span className={styles.person}>Ronald Lugtu</span> <span className={styles.title}>— Video Editor</span>
                    </li>
                    <li>
                      <span className={styles.person}>Michael John De Maliwat</span> <span className={styles.title}>— Multimedia Artist</span>
                    </li>
                  </ul>
                </li>
              </ul>
            </li>
            <li>
              <div className={styles.division}>Sales Division</div>
              <ul className={styles.tree}>
                <li>
                  <span className={styles.person}>Mae Japitan</span> <span className={styles.title}>— Sales Manager</span>
                  <ul className={styles.tree}>
                    <li>
                      <span className={styles.placeholder}>Sales Admins</span>
                    </li>
                  </ul>
                </li>
              </ul>
            </li>
          </ul>
        </div>

        {/* ===================== SHARED SERVICES ===================== */}
        <div className={styles.unitLabel}>V. Shared Services — reporting to the Vice Chairperson</div>

        {/* HR */}
        <div className={styles.dept} style={dcolor("--shared")}>
          <div className={styles.deptHead}>
            <h2>1. HR Department</h2>
          </div>
          <ul className={`${styles.tree} ${styles.root}`}>
            <li>
              <span className={styles.person}>Sheena A. Evangelista</span> <span className={styles.title}>— HR Manager</span>
            </li>
          </ul>
        </div>

        {/* Accounting */}
        <div className={styles.dept} style={dcolor("--shared")}>
          <div className={styles.deptHead}>
            <h2>2. Accounting Department</h2>
          </div>
          <ul className={`${styles.tree} ${styles.root}`}>
            <li>
              <span className={styles.person}>Maricris Barlinan</span> <span className={styles.title}>— Chief Finance Officer</span>
              <ul className={styles.tree}>
                <li>
                  <span className={styles.person}>Wendie Halog</span> <span className={styles.title}>— Sr. Accounting Assistant</span>
                  <ul className={styles.tree}>
                    <li>
                      <span className={styles.person}>Charmaine Palacio</span> <span className={styles.title}>— Jr. Accounting Assistant</span>
                    </li>
                    <li>
                      <span className={styles.person}>Kathleen Surigao</span> <span className={styles.title}>— Accounting Clerk</span>
                    </li>
                    <li>
                      <span className={styles.person}>Abigail Caluya</span> <span className={styles.title}>— Accounting Clerk</span>
                    </li>
                  </ul>
                </li>
              </ul>
            </li>
          </ul>
        </div>

        {/* Finance */}
        <div className={styles.dept} style={dcolor("--shared")}>
          <div className={styles.deptHead}>
            <h2>3. Finance Department</h2>
          </div>
          <ul className={`${styles.tree} ${styles.root}`}>
            <li>
              <span className={styles.person}>Joan Mariette Santarina</span>
              <ul className={styles.tree}>
                <li>
                  <span className={styles.person}>Erika Grace Bulaclac</span> <span className={styles.title}>— Bookkeeper</span>
                </li>
              </ul>
            </li>
          </ul>
        </div>

        {/* Operations */}
        <div className={styles.dept} style={dcolor("--shared")}>
          <div className={styles.deptHead}>
            <h2>4. Operations Department</h2>
          </div>
          <ul className={`${styles.tree} ${styles.root}`}>
            <li>
              <span className={styles.person}>Marlyn Leonardo</span> <span className={styles.title}>— Operations Manager</span>
              <ul className={styles.tree}>
                <li>
                  <span className={styles.person}>Charry Ann Asuncion</span> <span className={styles.title}>— CSR</span>
                </li>
                <li>
                  <span className={styles.person}>Ronnel Longalong</span> <span className={styles.title}>— Driver / Messenger</span>
                </li>
                <li>
                  <span className={styles.person}>Angelo Daiki Yamakawa</span> <span className={styles.title}>— Utility</span>
                </li>
                <li>
                  <span className={styles.person}>Jaimie Nucom</span> <span className={styles.title}>— Operations Supervisor</span>
                  <ul className={styles.tree}>
                    <li>
                      <span className={styles.branchTag}>Cabanatuan Branch</span>
                      <ul className={styles.tree}>
                        <li>
                          <span className={styles.person}>Reynalyn Alfonso</span> <span className={styles.title}>— Cashier</span>
                        </li>
                        <li>
                          <span className={styles.person}>Jomari De Dios</span> <span className={styles.title}>— Warehouseman</span>
                        </li>
                        <li>
                          <span className={styles.person}>Felix Ardee Santarina</span> <span className={styles.title}>— Logistics Staff</span>
                        </li>
                        <li>
                          <span className={styles.person}>Twinkle Ann Marayag</span> <span className={styles.title}>— Logistics Staff</span>
                        </li>
                      </ul>
                    </li>

                    <li>
                      <span className={styles.branchTag}>Manila Branch</span>
                      <ul className={styles.tree}>
                        <li>
                          <span className={styles.person}>Girlie Gail Gallardo</span> <span className={styles.title}>— Branch Manager</span>
                          <ul className={styles.tree}>
                            <li>
                              <span className={styles.person}>Ma. Abegail Fatima Jaba</span> <span className={styles.title}>— Branch Supervisor</span>
                              <ul className={styles.tree}>
                                <li>
                                  <span className={styles.person}>Jemuel Castillo</span> <span className={styles.title}>— Warehouseman</span>
                                </li>
                                <li>
                                  <span className={styles.person}>Clover Riomalos</span> <span className={styles.title}>— Stockman</span>
                                </li>
                                <li>
                                  <span className={styles.person}>Abegail Bordaje</span> <span className={styles.title}>— Cashier</span>
                                </li>
                                <li>
                                  <span className={styles.person}>Dayanara Flores</span> <span className={styles.title}>— Cashier</span>
                                </li>
                              </ul>
                            </li>
                          </ul>
                        </li>
                      </ul>
                    </li>

                    <li>
                      <span className={styles.branchTag}>Cebu Branch</span>
                      <ul className={styles.tree}>
                        <li>
                          <span className={styles.person}>Mary Jane Pedrano</span> <span className={styles.title}>— Branch Manager</span>
                          <ul className={styles.tree}>
                            <li>
                              <span className={styles.person}>Karlou James Japitan</span> <span className={styles.title}>— Branch Supervisor</span>
                              <ul className={styles.tree}>
                                <li>
                                  <span className={styles.person}>Leonilyn Talisic</span> <span className={styles.title}>— Cashier</span>
                                </li>
                                <li>
                                  <span className={styles.person}>Ricky Malasa</span> <span className={styles.title}>— Stockman</span>
                                </li>
                                <li>
                                  <span className={styles.person}>Jober Bersanal</span> <span className={styles.title}>— Driver / Warehouseman</span>
                                </li>
                              </ul>
                            </li>
                          </ul>
                        </li>
                      </ul>
                    </li>

                    <li>
                      <span className={styles.branchTag}>Cavite Branch</span>
                      <ul className={styles.tree}>
                        <li>
                          <span className={styles.person}>Rhea Francisco</span> <span className={styles.title}>— Cashier</span>
                        </li>
                        <li>
                          <span className={styles.person}>Gretchen De Sosa</span> <span className={styles.title}>— Cashier</span>
                        </li>
                      </ul>
                    </li>

                    <li>
                      <span className={styles.branchTag}>Pangasinan Branch</span>
                      <ul className={styles.tree}>
                        <li>
                          <span className={styles.person}>Daniel Bato</span> <span className={styles.title}>— Cashier</span>
                        </li>
                      </ul>
                    </li>

                    <li>
                      <span className={styles.branchTag}>Lucena Branch</span>
                      <ul className={styles.tree}>
                        <li>
                          <span className={styles.person}>Jebeth Guinto</span> <span className={styles.title}>— Cashier</span>
                        </li>
                      </ul>
                    </li>

                    <li>
                      <span className={styles.branchTag}>Bacolod Branch</span>
                      <ul className={styles.tree}>
                        <li>
                          <span className={styles.person}>Catherine Mogato</span> <span className={styles.title}>— Cashier</span>
                        </li>
                      </ul>
                    </li>

                    <li>
                      <span className={styles.branchTag}>Bohol Branch (Divine Care)</span>
                      <ul className={styles.tree}>
                        <li>
                          <span className={styles.person}>Karen Itong</span> <span className={styles.title}>— Cashier</span>
                        </li>
                      </ul>
                    </li>

                    <li>
                      <span className={styles.branchTag}>Cagayan De Oro Branch</span>
                      <ul className={styles.tree}>
                        <li>
                          <span className={styles.person}>Jemima Amestoso</span> <span className={styles.title}>— Cashier</span>
                        </li>
                      </ul>
                    </li>

                    <li>
                      <span className={styles.branchTag}>Davao Branch</span>
                      <ul className={styles.tree}>
                        <li>
                          <span className={styles.person}>Charles Villamor</span> <span className={styles.title}>— Cashier</span>
                        </li>
                      </ul>
                    </li>
                  </ul>
                </li>
              </ul>
            </li>
          </ul>
        </div>

        <div className={styles.footer}>Shantahl Direct Sales Inc. — Organization Chart · Prepared for internal reference</div>
      </div>
    </div>
  );
}
